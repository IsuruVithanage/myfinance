import { and, eq, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, transactions } from "@/lib/db/schema";
import {
  getBudgetStatus,
  getCardsOverview,
  getOverallBudgets,
  getPeopleOverview,
} from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { BASE_CURRENCY } from "@/lib/fx";
import { iso } from "@/lib/cards";
import { differenceInCalendarDays } from "date-fns";

type Draft = {
  kind: string;
  severity: "info" | "warn" | "urgent";
  title: string;
  body: string;
  dedupeKey: string;
  href?: string;
  dueDate?: string;
};

/**
 * Recompute the alert inbox. Idempotent: `dedupeKey` means re-running only
 * refreshes wording, never duplicates a card's due reminder. Alerts that no
 * longer apply (bill paid, budget reset) are removed.
 */
/**
 * Due dates move once a day, so recomputing on every navigation is pure write
 * amplification against a free-tier database. One pass every few minutes per
 * warm instance is plenty; `force` skips the throttle for the manual refresh.
 */
let lastRun = 0;
const THROTTLE_MS = 5 * 60_000;

export async function refreshNotifications(force = false) {
  if (!force && Date.now() - lastRun < THROTTLE_MS) return 0;
  lastRun = Date.now();

  const drafts: Draft[] = [];
  const today = new Date();

  /**
   * The four sources are independent, so fetch them together. Sequentially
   * this was nine round trips to the database on every cold page load.
   */
  const [cards, budgets, overall, overdueLoans] = await Promise.all([
    getCardsOverview(),
    getBudgetStatus(),
    getOverallBudgets(),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        expectedOn: transactions.expectedOn,
        counterpartyId: transactions.counterpartyId,
        description: transactions.description,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, "lend"),
          isNotNull(transactions.expectedOn),
          lte(transactions.expectedOn, iso(today)),
        ),
      ),
  ]);

  /* ── credit card due dates ─────────────────────────────────────── */
  for (const c of cards) {
    const days = c.cycle.daysUntilDue;
    if (!c.settled && days <= c.cardDetail.alertDaysBefore) {
      const amount = formatMoney(c.outstandingMinor, c.currency);
      const when =
        days < 0
          ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
          : days === 0
            ? "due today"
            : `due in ${days} day${days === 1 ? "" : "s"}`;
      drafts.push({
        kind: "card_due",
        severity: days <= 1 ? "urgent" : days <= 3 ? "urgent" : "warn",
        title: `${c.name} — ${when}`,
        body: `${amount} outstanding. Minimum ${formatMoney(c.minPaymentMinor, c.currency)}.`,
        dedupeKey: `card_due:${c.id}:${iso(c.cycle.dueDate)}`,
        href: `/cards`,
        dueDate: iso(c.cycle.dueDate),
      });
    }

    if (c.utilisation != null && c.utilisation >= 0.7) {
      drafts.push({
        kind: "card_utilisation",
        severity: c.utilisation >= 0.9 ? "urgent" : "warn",
        title: `${c.name} is ${Math.round(c.utilisation * 100)}% used`,
        body: `${formatMoney(c.availableMinor, c.currency)} of credit left.`,
        dedupeKey: `card_utilisation:${c.id}:${iso(today).slice(0, 7)}`,
        href: `/cards`,
      });
    }
  }

  /* ── budgets, each against its own week or month ───────────────── */
  for (const b of budgets) {
    if (b.ratio < 0.8) continue;
    drafts.push({
      kind: "budget",
      severity: b.ratio >= 1 ? "urgent" : "warn",
      title:
        b.ratio >= 1
          ? `${b.name} is over budget`
          : `${b.name} at ${Math.round(b.ratio * 100)}% of budget`,
      body:
        `${formatMoney(b.spentMinor, BASE_CURRENCY)} of ` +
        `${formatMoney(b.budgetMinor, BASE_CURRENCY)} ` +
        `${b.period === "weekly" ? "this week" : "this month"}.`,
      // Keyed by the period window, so a weekly alert can fire again next week.
      dedupeKey: `budget:${b.id}:${b.window.from}`,
      href: `/budgets`,
    });
  }

  /* ── overall spending caps ─────────────────────────────────────── */
  for (const o of overall) {
    if (o.budgetMinor <= 0 || o.ratio < 0.8) continue;
    const window = o.period === "weekly" ? "this week" : "this month";
    drafts.push({
      kind: "overall_budget",
      severity: o.ratio >= 1 ? "urgent" : "warn",
      title:
        o.ratio >= 1
          ? `Over your ${o.period === "weekly" ? "weekly" : "monthly"} limit`
          : `${Math.round(o.ratio * 100)}% of your ${o.period === "weekly" ? "weekly" : "monthly"} limit`,
      body:
        `${formatMoney(o.spentMinor, BASE_CURRENCY)} of ` +
        `${formatMoney(o.budgetMinor, BASE_CURRENCY)} spent ${window}.`,
      dedupeKey: `overall_budget:${o.period}:${o.window.from}`,
      href: "/budgets",
    });
  }

  /* ── loans past their expected return date ─────────────────────── */
  if (overdueLoans.length) {
    const people = await getPeopleOverview();
    const stillOwing = new Map(
      people.filter((p) => p.owedToYouBase > 0).map((p) => [p.person.id, p]),
    );
    for (const loan of overdueLoans) {
      if (!loan.counterpartyId) continue;
      const p = stillOwing.get(loan.counterpartyId);
      if (!p) continue;
      const late = differenceInCalendarDays(today, new Date(loan.expectedOn!));
      drafts.push({
        kind: "loan_overdue",
        severity: late > 30 ? "urgent" : "warn",
        title: `${p.person.name} — repayment ${late} day${late === 1 ? "" : "s"} late`,
        body: `${formatMoney(p.owedToYouBase, BASE_CURRENCY)} still outstanding.`,
        dedupeKey: `loan_overdue:${loan.id}`,
        href: `/people`,
      });
    }
  }

  /* ── write: upsert the live set, clear anything stale ──────────── */
  const liveKeys = drafts.map((d) => d.dedupeKey);

  if (drafts.length) {
    await db
      .insert(notifications)
      .values(
        drafts.map((d) => ({
          kind: d.kind,
          severity: d.severity,
          title: d.title,
          body: d.body,
          dedupeKey: d.dedupeKey,
          href: d.href ?? null,
          dueDate: d.dueDate ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: notifications.dedupeKey,
        set: {
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          severity: sql`excluded.severity`,
          dueDate: sql`excluded.due_date`,
        },
      });
  }

  // Drop anything that no longer applies — a bill paid, a budget reset.
  // Raw `<> all($1)` cannot take a JS array as one parameter, so use the
  // builder, and clear the table outright when nothing is live.
  if (liveKeys.length) {
    await db
      .delete(notifications)
      .where(notInArray(notifications.dedupeKey, liveKeys));
  } else {
    await db.delete(notifications);
  }

  return drafts.length;
}
