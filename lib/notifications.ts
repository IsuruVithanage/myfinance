import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, notifications, postings, transactions } from "@/lib/db/schema";
import { getCardsOverview, getPeopleOverview } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { BASE_CURRENCY } from "@/lib/fx";
import { iso } from "@/lib/cards";
import { endOfMonth, startOfMonth, differenceInCalendarDays } from "date-fns";

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

  /* ── credit card due dates ─────────────────────────────────────── */
  const cards = await getCardsOverview();
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

  /* ── budgets ───────────────────────────────────────────────────── */
  const from = iso(startOfMonth(today));
  const to = iso(endOfMonth(today));
  const budgetRows = await db
    .select({
      id: categories.id,
      name: categories.name,
      budget: categories.monthlyBudgetMinor,
      spent: sql<number>`coalesce(sum(${postings.baseAmountMinor}), 0)`.mapWith(Number),
    })
    .from(categories)
    .leftJoin(postings, eq(postings.categoryId, categories.id))
    .leftJoin(
      transactions,
      and(
        eq(transactions.id, postings.transactionId),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    )
    .where(and(eq(categories.kind, "expense"), sql`${categories.monthlyBudgetMinor} > 0`))
    .groupBy(categories.id, categories.name, categories.monthlyBudgetMinor);

  for (const b of budgetRows) {
    if (b.budget <= 0) continue;
    const ratio = b.spent / b.budget;
    if (ratio < 0.8) continue;
    drafts.push({
      kind: "budget",
      severity: ratio >= 1 ? "urgent" : "warn",
      title:
        ratio >= 1
          ? `${b.name} is over budget`
          : `${b.name} at ${Math.round(ratio * 100)}% of budget`,
      body: `${formatMoney(b.spent, BASE_CURRENCY)} of ${formatMoney(b.budget, BASE_CURRENCY)} this month.`,
      dedupeKey: `budget:${b.id}:${from.slice(0, 7)}`,
      href: `/reports`,
    });
  }

  /* ── loans past their expected return date ─────────────────────── */
  const overdueLoans = await db
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
    );

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

  await db.delete(notifications).where(
    liveKeys.length
      ? sql`${notifications.dedupeKey} <> all(${liveKeys})`
      : sql`true`,
  );

  return drafts.length;
}
