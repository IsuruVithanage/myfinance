import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { fxRates, settings } from "@/lib/db/schema";
import type { Currency } from "@/lib/db/schema";
import { BASE_CURRENCY } from "@/lib/money";

export { BASE_CURRENCY };

/**
 * USD→LKR for a given date: the newest manually-recorded rate on or before
 * that date, falling back to the rate stored in settings.
 *
 * Rates here are *informational* — every transaction stores its own converted
 * base amount at write time, so changing a rate later never silently rewrites
 * history.
 */
export async function getUsdLkrRate(onDate: string): Promise<number> {
  const [row] = await db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.base, "USD"),
        eq(fxRates.quote, "LKR"),
        lte(fxRates.date, onDate),
      ),
    )
    .orderBy(desc(fxRates.date))
    .limit(1);

  if (row) return Number(row.rate);

  const [cfg] = await db
    .select({ fallback: settings.fallbackUsdLkr })
    .from(settings)
    .limit(1);
  return cfg ? Number(cfg.fallback) : 300;
}

/**
 * Convert minor units between our two currencies.
 * `rate` is always USD→LKR (e.g. 305.50).
 */
export function convertMinor(
  amountMinor: number,
  from: Currency,
  to: Currency,
  usdLkrRate: number,
): number {
  if (from === to) return amountMinor;
  // LKR and USD both use 2 decimals, so the rate applies directly to minors.
  if (from === "USD" && to === "LKR")
    return Math.round(amountMinor * usdLkrRate);
  if (from === "LKR" && to === "USD")
    return Math.round(amountMinor / usdLkrRate);
  return amountMinor;
}

/** Convert an amount into the base currency (LKR) for reporting. */
export function toBaseMinor(
  amountMinor: number,
  currency: Currency,
  usdLkrRate: number,
): number {
  return convertMinor(amountMinor, currency, BASE_CURRENCY, usdLkrRate);
}
