import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fxRates, settings } from "@/lib/db/schema";

/**
 * Live USD→LKR, from free sources that need no API key.
 *
 * Two providers, tried in order, because a single free endpoint going down
 * should not leave balances valued at a rate from months ago. Both publish
 * once a day, so there is nothing to gain from polling harder than that.
 */

type Feed = {
  name: string;
  url: string;
  read: (json: unknown) => number | null;
};

const FEEDS: Feed[] = [
  {
    name: "open.er-api.com",
    url: "https://open.er-api.com/v6/latest/USD",
    read: (json) => {
      const d = json as { result?: string; rates?: Record<string, number> };
      if (d.result !== "success") return null;
      return d.rates?.LKR ?? null;
    },
  },
  {
    name: "currency-api",
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    read: (json) => {
      const d = json as { usd?: Record<string, number> };
      return d.usd?.lkr ?? null;
    },
  },
];

/**
 * Reject anything outside a plausible band. This is the guard against a feed
 * silently returning a different currency, an inverted rate, or a zero — any
 * of which would quietly misvalue every USD balance in the app. The band is
 * wide enough to survive a severe devaluation; a rate outside it should be
 * entered by hand rather than trusted.
 */
const MIN_RATE = 50;
const MAX_RATE = 2000;

function plausible(rate: number | null): rate is number {
  return (
    typeof rate === "number" &&
    Number.isFinite(rate) &&
    rate >= MIN_RATE &&
    rate <= MAX_RATE
  );
}

export type FetchedRate = { rate: number; source: string };

/** Try each feed in turn. Returns null only if all of them fail. */
export async function fetchUsdLkrRate(): Promise<FetchedRate | null> {
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!res.ok) continue;

      const rate = feed.read(await res.json());
      if (!plausible(rate)) continue;

      return { rate: Number(rate.toFixed(4)), source: feed.name };
    } catch {
      // Network error, timeout or bad JSON — fall through to the next feed.
    }
  }
  return null;
}

/** Today's stored rate, if one has already been fetched. */
export async function todaysStoredRate(today: string) {
  const [row] = await db
    .select()
    .from(fxRates)
    .where(
      and(
        eq(fxRates.date, today),
        eq(fxRates.base, "USD"),
        eq(fxRates.quote, "LKR"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Refresh at most once a day, since the feeds publish daily.
 *
 * Never throws: a finance app must still render its balances when the network
 * is down. On failure the previously stored rate simply stays in force.
 */
export async function refreshUsdLkrRate(options?: { force?: boolean }) {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const existing = await todaysStoredRate(today);
    if (existing && existing.source !== "manual" && !options?.force) {
      return { rate: Number(existing.rate), source: existing.source, fresh: false };
    }
    // A rate you typed yourself wins for the rest of the day unless you ask.
    if (existing?.source === "manual" && !options?.force) {
      return { rate: Number(existing.rate), source: "manual", fresh: false };
    }

    const fetched = await fetchUsdLkrRate();
    if (!fetched) return null;

    await db
      .insert(fxRates)
      .values({
        date: today,
        base: "USD",
        quote: "LKR",
        rate: String(fetched.rate),
        source: fetched.source,
      })
      .onConflictDoUpdate({
        target: [fxRates.date, fxRates.base, fxRates.quote],
        set: { rate: String(fetched.rate), source: fetched.source },
      });

    // Keep the fallback in step, so conversions outside a dated lookup agree.
    await db
      .insert(settings)
      .values({ id: 1, fallbackUsdLkr: String(fetched.rate) })
      .onConflictDoUpdate({
        target: settings.id,
        set: { fallbackUsdLkr: String(fetched.rate), updatedAt: new Date() },
      });

    return { ...fetched, fresh: true };
  } catch {
    return null;
  }
}

/** The rate currently in force, with where it came from and how old it is. */
export async function currentRateInfo() {
  const [row] = await db
    .select()
    .from(fxRates)
    .where(and(eq(fxRates.base, "USD"), eq(fxRates.quote, "LKR")))
    .orderBy(desc(fxRates.date))
    .limit(1);

  if (!row) {
    const [cfg] = await db.select().from(settings).limit(1);
    return {
      rate: cfg ? Number(cfg.fallbackUsdLkr) : 300,
      source: "manual",
      date: null as string | null,
    };
  }

  return { rate: Number(row.rate), source: row.source, date: row.date };
}
