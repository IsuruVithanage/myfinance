import { addMonths, addWeeks, addYears, differenceInCalendarDays, format } from "date-fns";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, subscriptions } from "@/lib/db/schema";
import type { Subscription, SubscriptionCycle } from "@/lib/db/schema";
import { getUsdLkrRate, toBaseMinor } from "@/lib/fx";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Parse a `yyyy-MM-dd` as a local calendar date, never shifted by timezone. */
function day(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * `n` cycles after `start`, always counted from the original date. Stepping one
 * month at a time would drift a plan billed on the 31st to the 28th after
 * February and leave it there.
 */
function advance(start: Date, cycle: SubscriptionCycle, n: number) {
  if (cycle === "weekly") return addWeeks(start, n);
  if (cycle === "yearly") return addYears(start, n);
  return addMonths(start, n);
}

/**
 * The date that matters today.
 *
 * A renewing plan whose stored date has passed has simply renewed, so roll it
 * forward by whole cycles until it lands on or after today — that keeps the
 * date right without anyone having to edit it every month. A plan that does
 * not renew keeps its date, and once that passes it has expired.
 */
export function effectiveDate(
  sub: Pick<Subscription, "nextDate" | "cycle" | "autoRenew">,
  today = new Date(),
) {
  const start = day(sub.nextDate);
  if (!sub.autoRenew) return start;

  const floor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let d = start;
  // Bounded: even a weekly plan ten years stale is ~520 steps.
  for (let n = 1; d < floor && n < 2000; n++) d = advance(start, sub.cycle, n);
  return d;
}

/** What a plan costs per month, so different cycles can be added up. */
export function monthlyEquivalent(amountMinor: number, cycle: SubscriptionCycle) {
  if (cycle === "weekly") return Math.round((amountMinor * 52) / 12);
  if (cycle === "yearly") return Math.round(amountMinor / 12);
  return amountMinor;
}

export type SubscriptionView = Awaited<ReturnType<typeof getSubscriptions>>["items"][number];

/**
 * Every subscription, soonest first, with its live date, days left, status,
 * and its cost converted to LKR at today's rate.
 */
export async function getSubscriptions(today = new Date()) {
  const [rows, rate] = await Promise.all([
    db
      .select({ sub: subscriptions, accountName: accounts.name })
      .from(subscriptions)
      .leftJoin(accounts, eq(accounts.id, subscriptions.accountId))
      .orderBy(asc(subscriptions.nextDate)),
    getUsdLkrRate(iso(today)),
  ]);

  const items = rows
    .map(({ sub, accountName }) => {
      const date = effectiveDate(sub, today);
      const daysLeft = differenceInCalendarDays(date, today);
      const expired = !sub.autoRenew && daysLeft < 0;
      const monthlyMinor = monthlyEquivalent(sub.amountMinor, sub.cycle);
      return {
        ...sub,
        accountName,
        date: iso(date),
        daysLeft,
        status: expired
          ? ("expired" as const)
          : sub.autoRenew
            ? ("renews" as const)
            : ("expires" as const),
        monthlyBaseMinor: toBaseMinor(monthlyMinor, sub.currency, rate),
      };
    })
    // Expired plans sink to the bottom; everything else by what comes next.
    .sort((a, b) =>
      a.status === "expired" && b.status !== "expired"
        ? 1
        : b.status === "expired" && a.status !== "expired"
          ? -1
          : a.daysLeft - b.daysLeft,
    );

  const active = items.filter((i) => i.status !== "expired");
  return {
    items,
    activeCount: active.length,
    monthlyTotalBase: active.reduce((t, i) => t + i.monthlyBaseMinor, 0),
  };
}

export async function getSubscription(id: number) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * "Renews today", "Renews 20 Oct · 5 days", "Expired 10 Oct" — date first and
 * short, so it fits beside the price on a phone.
 */
export function whenLabel(
  s: Pick<SubscriptionView, "status" | "daysLeft" | "date">,
) {
  const date = new Date(`${s.date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  if (s.status === "expired") return `Expired ${date}`;
  const verb = s.status === "renews" ? "Renews" : "Expires";
  if (s.daysLeft === 0) return `${verb} today`;
  if (s.daysLeft === 1) return `${verb} tomorrow`;
  return `${verb} ${date} · ${s.daysLeft} days`;
}
