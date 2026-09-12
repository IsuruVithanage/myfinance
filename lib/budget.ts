import {
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { BudgetPeriod } from "@/lib/db/schema";

/** Weeks run Monday to Sunday. */
const WEEK_OPTS = { weekStartsOn: 1 as const };

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** The window a budget is currently being measured against. */
export function currentPeriod(period: BudgetPeriod, today = new Date()) {
  if (period === "weekly") {
    return {
      from: iso(startOfWeek(today, WEEK_OPTS)),
      to: iso(endOfWeek(today, WEEK_OPTS)),
      label: "this week",
    };
  }
  return {
    from: iso(startOfMonth(today)),
    to: iso(endOfMonth(today)),
    label: "this month",
  };
}

/**
 * What a budget is worth across an arbitrary reporting range — so a weekly
 * budget compared against a three-month report scales to the number of weeks
 * in it, not to three.
 */
export function budgetForRange(
  budgetMinor: number,
  period: BudgetPeriod,
  from: string,
  to: string,
): number {
  if (budgetMinor <= 0) return 0;

  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days = differenceInCalendarDays(end, start) + 1;
  if (days <= 0) return 0;

  const periods = period === "weekly" ? days / 7 : days / 30.44; // mean month
  return Math.round(budgetMinor * periods);
}

/** How far through the current period we are, 0–1. Drives "on pace" wording. */
export function periodProgress(period: BudgetPeriod, today = new Date()) {
  const { from, to } = currentPeriod(period, today);
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const total = differenceInCalendarDays(end, start) + 1;
  const elapsed = differenceInCalendarDays(today, start) + 1;
  return Math.min(1, Math.max(0, elapsed / total));
}

export const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
};
