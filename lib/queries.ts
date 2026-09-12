import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts,
  cardDetails,
  categories,
  counterparties,
  notifications,
  postings,
  settings,
  transactions,
} from "@/lib/db/schema";
import type { Currency } from "@/lib/db/schema";
import { BASE_CURRENCY, getUsdLkrRate, toBaseMinor } from "@/lib/fx";
import { getCardCycle, iso, utilisation } from "@/lib/cards";
import { currentPeriod, periodProgress } from "@/lib/budget";

const num = (expr: ReturnType<typeof sql>) => sql<number>`${expr}`.mapWith(Number);

/* ─────────────────────────────  settings  ────────────────────────── */

export async function getSettings() {
  const [row] = await db.select().from(settings).limit(1);
  return (
    row ?? {
      id: 1,
      baseCurrency: BASE_CURRENCY,
      fallbackUsdLkr: "300",
      locale: "en-LK",
      updatedAt: new Date(),
    }
  );
}

/* ─────────────────────────────  accounts  ────────────────────────── */

/** Balance = opening balance + every posting that touched the account. */
const accountDeltas = db
  .select({
    accountId: postings.accountId,
    delta: sql<number>`coalesce(sum(${postings.amountMinor}), 0)`
      .mapWith(Number)
      .as("delta"),
  })
  .from(postings)
  .where(isNotNull(postings.accountId))
  .groupBy(postings.accountId)
  .as("account_deltas");

export type AccountWithBalance = Awaited<
  ReturnType<typeof getAccountsWithBalances>
>[number];

export async function getAccountsWithBalances(opts?: { includeArchived?: boolean }) {
  const rate = await getUsdLkrRate(iso(new Date()));

  const rows = await db
    .select({
      account: accounts,
      card: cardDetails,
      person: counterparties,
      delta: sql<number>`coalesce(${accountDeltas.delta}, 0)`.mapWith(Number),
    })
    .from(accounts)
    .leftJoin(accountDeltas, eq(accountDeltas.accountId, accounts.id))
    .leftJoin(cardDetails, eq(cardDetails.accountId, accounts.id))
    .leftJoin(counterparties, eq(counterparties.id, accounts.counterpartyId))
    .orderBy(accounts.sortOrder, accounts.name);

  return rows
    .filter((r) => opts?.includeArchived || r.account.isActive)
    .map((r) => {
      const balanceMinor = r.account.openingBalanceMinor + r.delta;
      return {
        ...r.account,
        card: r.card,
        person: r.person,
        balanceMinor,
        /**
         * What the balance is worth TODAY. Postings store the rate that was
         * used at the time — right for income/expense reports, wrong for a
         * balance, because a USD account you still hold is worth today's rate,
         * not a blend of every rate you ever transacted at.
         */
        baseBalanceMinor: toBaseMinor(balanceMinor, r.account.currency, rate),
      };
    });
}

export async function getAccount(id: number) {
  const all = await getAccountsWithBalances({ includeArchived: true });
  return all.find((a) => a.id === id) ?? null;
}

/** Net worth, split by currency so nothing is silently blended. */
export async function getNetWorth() {
  const all = await getAccountsWithBalances();
  const counted = all.filter((a) => a.includeInNetWorth);

  const byCurrency: Record<Currency, number> = { LKR: 0, USD: 0 };
  let totalBase = 0;
  let assetsBase = 0;
  let liabilitiesBase = 0;

  for (const a of counted) {
    byCurrency[a.currency] += a.balanceMinor;
    totalBase += a.baseBalanceMinor;
    if (a.baseBalanceMinor >= 0) assetsBase += a.baseBalanceMinor;
    else liabilitiesBase += a.baseBalanceMinor;
  }

  return { byCurrency, totalBase, assetsBase, liabilitiesBase, accounts: counted };
}

/* ────────────────────────────  categories  ───────────────────────── */

export async function getCategories(kind?: "expense" | "income") {
  const rows = await db
    .select()
    .from(categories)
    .orderBy(categories.sortOrder, categories.name);
  return kind ? rows.filter((c) => c.kind === kind) : rows;
}

/** Named lookups for the categories the ledger books to automatically. */
export async function getSystemCategory(name: string) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.name, name), eq(categories.isSystem, true)))
    .limit(1);
  return row ?? null;
}

/* ───────────────────────────  transactions  ──────────────────────── */

export type TransactionRow = Awaited<ReturnType<typeof getTransactions>>[number];

export async function getTransactions(opts: {
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  accountId?: number;
  categoryId?: number;
  counterpartyId?: number;
  /** Free text: matches description, note, category, account or person. */
  q?: string;
} = {}) {
  const where = [];
  if (opts.from) where.push(gte(transactions.date, opts.from));
  if (opts.to) where.push(lte(transactions.date, opts.to));
  if (opts.counterpartyId)
    where.push(eq(transactions.counterpartyId, opts.counterpartyId));

  const q = opts.q?.trim();
  if (q) {
    const like = `%${q}%`;
    // Match the words a human would remember: what they typed in the note, or
    // the name of the category, account or person it touched.
    const viaPostings = db
      .select({ id: postings.transactionId })
      .from(postings)
      .leftJoin(accounts, eq(accounts.id, postings.accountId))
      .leftJoin(categories, eq(categories.id, postings.categoryId))
      .where(
        sql`${accounts.name} ilike ${like} or ${categories.name} ilike ${like}`,
      );

    where.push(
      sql`(${transactions.description} ilike ${like}
           or ${transactions.note} ilike ${like}
           or ${transactions.id} in ${viaPostings}
           or ${transactions.counterpartyId} in (
                select ${counterparties.id} from ${counterparties}
                where ${counterparties.name} ilike ${like}
              ))`,
    );
  }

  if (opts.accountId || opts.categoryId) {
    const matching = db
      .select({ id: postings.transactionId })
      .from(postings)
      .where(
        opts.accountId
          ? eq(postings.accountId, opts.accountId)
          : eq(postings.categoryId, opts.categoryId!),
      );
    where.push(inArray(transactions.id, matching));
  }

  const txns = await db
    .select()
    .from(transactions)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);

  if (txns.length === 0) return [];

  const ids = txns.map((t) => t.id);
  const legs = await db
    .select({
      posting: postings,
      accountName: accounts.name,
      accountType: accounts.type,
      accountColor: accounts.color,
      categoryName: categories.name,
      categoryKind: categories.kind,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(postings)
    .leftJoin(accounts, eq(accounts.id, postings.accountId))
    .leftJoin(categories, eq(categories.id, postings.categoryId))
    .where(inArray(postings.transactionId, ids));

  const people = await db.select().from(counterparties);
  const personById = new Map(people.map((p) => [p.id, p]));

  return txns.map((t) => ({
    ...t,
    person: t.counterpartyId ? (personById.get(t.counterpartyId) ?? null) : null,
    legs: legs.filter((l) => l.posting.transactionId === t.id),
  }));
}

export async function getTransaction(id: number) {
  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  if (!txn) return null;

  const legs = await db
    .select({
      posting: postings,
      accountName: accounts.name,
      accountType: accounts.type,
      accountColor: accounts.color,
      categoryName: categories.name,
      categoryKind: categories.kind,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(postings)
    .leftJoin(accounts, eq(accounts.id, postings.accountId))
    .leftJoin(categories, eq(categories.id, postings.categoryId))
    .where(eq(postings.transactionId, id));

  const person = txn.counterpartyId
    ? ((
        await db
          .select()
          .from(counterparties)
          .where(eq(counterparties.id, txn.counterpartyId))
          .limit(1)
      )[0] ?? null)
    : null;

  return { ...txn, person, legs };
}

/* ─────────────────────────────  reports  ─────────────────────────── */

/** Income and expense totals for a date range, in base currency. */
export async function getPeriodTotals(from: string, to: string) {
  const [row] = await db
    .select({
      expense: num(
        sql`coalesce(sum(case when ${categories.kind} = 'expense' then ${postings.baseAmountMinor} else 0 end), 0)`,
      ),
      income: num(
        sql`coalesce(sum(case when ${categories.kind} = 'income' then -${postings.baseAmountMinor} else 0 end), 0)`,
      ),
    })
    .from(postings)
    .innerJoin(categories, eq(categories.id, postings.categoryId))
    .innerJoin(transactions, eq(transactions.id, postings.transactionId))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  const expense = row?.expense ?? 0;
  const income = row?.income ?? 0;
  return { expense, income, net: income - expense };
}

/** Day-by-day in/out for a range — powers the area chart. */
export async function getDailySeries(from: string, to: string) {
  const rows = await db
    .select({
      date: sql<string>`to_char(${transactions.date}, 'YYYY-MM-DD')`,
      expense: num(
        sql`coalesce(sum(case when ${categories.kind} = 'expense' then ${postings.baseAmountMinor} else 0 end), 0)`,
      ),
      income: num(
        sql`coalesce(sum(case when ${categories.kind} = 'income' then -${postings.baseAmountMinor} else 0 end), 0)`,
      ),
    })
    .from(postings)
    .innerJoin(categories, eq(categories.id, postings.categoryId))
    .innerJoin(transactions, eq(transactions.id, postings.transactionId))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(transactions.date)
    .orderBy(transactions.date);

  // Fill the gaps so the line reads as a timeline, not a list of events.
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: Array<{ date: string; expense: number; income: number }> = [];
  const cursor = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(byDate.get(key) ?? { date: key, expense: 0, income: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** The equally sized window immediately before [from, to]. */
function previousWindow(from: string, to: string) {
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return {
    from: prevStart.toISOString().slice(0, 10),
    to: prevEnd.toISOString().slice(0, 10),
  };
}

/** Spend (or income) per category for a range — powers the reports pie. */
export async function getCategoryBreakdown(
  from: string,
  to: string,
  kind: "expense" | "income" = "expense",
) {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
      budgetMinor: categories.budgetMinor,
      budgetPeriod: categories.budgetPeriod,
      totalBase: num(
        sql`coalesce(sum(${kind === "income" ? sql`-` : sql``}${postings.baseAmountMinor}), 0)`,
      ),
      txnCount: num(sql`count(distinct ${postings.transactionId})`),
    })
    .from(postings)
    .innerJoin(categories, eq(categories.id, postings.categoryId))
    .innerJoin(transactions, eq(transactions.id, postings.transactionId))
    .where(
      and(
        eq(categories.kind, kind),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    )
    .groupBy(
      categories.id,
      categories.name,
      categories.color,
      categories.icon,
      categories.budgetMinor,
      categories.budgetPeriod,
    )
    .orderBy(desc(num(sql`coalesce(sum(${postings.baseAmountMinor}), 0)`)));

  // Same-length window just before this one, so each row can show a trend.
  const prev = previousWindow(from, to);
  const prevRows = await db
    .select({
      categoryId: categories.id,
      totalBase: num(
        sql`coalesce(sum(${kind === "income" ? sql`-` : sql``}${postings.baseAmountMinor}), 0)`,
      ),
    })
    .from(postings)
    .innerJoin(categories, eq(categories.id, postings.categoryId))
    .innerJoin(transactions, eq(transactions.id, postings.transactionId))
    .where(
      and(
        eq(categories.kind, kind),
        gte(transactions.date, prev.from),
        lte(transactions.date, prev.to),
      ),
    )
    .groupBy(categories.id);

  const prevById = new Map(prevRows.map((r) => [r.categoryId, r.totalBase]));

  return rows
    .filter((r) => r.totalBase !== 0)
    .map((r) => {
      const before = prevById.get(r.categoryId) ?? 0;
      return {
        ...r,
        // No previous spend means no honest percentage to show.
        change: before > 0 ? (r.totalBase - before) / before : null,
      };
    });
}

/** Month-by-month income vs expense for the trend chart. */
export async function getMonthlyTrend(months = 6) {
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${transactions.date}), 'YYYY-MM')`,
      expense: num(
        sql`coalesce(sum(case when ${categories.kind} = 'expense' then ${postings.baseAmountMinor} else 0 end), 0)`,
      ),
      income: num(
        sql`coalesce(sum(case when ${categories.kind} = 'income' then -${postings.baseAmountMinor} else 0 end), 0)`,
      ),
    })
    .from(postings)
    .innerJoin(categories, eq(categories.id, postings.categoryId))
    .innerJoin(transactions, eq(transactions.id, postings.transactionId))
    .where(
      gte(
        transactions.date,
        sql`(date_trunc('month', current_date) - make_interval(months => ${months - 1}))::date`,
      ),
    )
    .groupBy(sql`date_trunc('month', ${transactions.date})`)
    .orderBy(sql`date_trunc('month', ${transactions.date})`);

  return rows;
}

/** Categories you actually use, most-used first — drives the quick-add chips. */
export async function getFrequentCategories(
  kind: "expense" | "income",
  days = 120,
  limit = 10,
) {
  const rows = await db
    .select({
      id: categories.id,
      uses: num(sql`count(*)`),
    })
    .from(postings)
    .innerJoin(categories, eq(categories.id, postings.categoryId))
    .innerJoin(transactions, eq(transactions.id, postings.transactionId))
    .where(
      and(
        eq(categories.kind, kind),
        sql`${transactions.date} >= current_date - make_interval(days => ${days})`,
      ),
    )
    .groupBy(categories.id)
    .orderBy(desc(num(sql`count(*)`)))
    .limit(limit);
  return rows.map((r) => r.id);
}

/* ──────────────────────────  credit cards  ───────────────────────── */

export type CardOverview = Awaited<ReturnType<typeof getCardsOverview>>[number];

export async function getCardsOverview() {
  const all = await getAccountsWithBalances();
  const cards = all.filter((a) => a.type === "credit_card" && a.card);
  if (cards.length === 0) return [];

  const today = new Date();

  return Promise.all(
    cards.map(async (a) => {
      const card = a.card!;
      const cycle = getCardCycle(
        today,
        card.statementDay,
        card.dueDay,
        card.dueMonthOffset,
      );

      // What the closed statement asked for: net movement during that cycle.
      const [stmt] = await db
        .select({
          net: num(sql`coalesce(sum(${postings.amountMinor}), 0)`),
        })
        .from(postings)
        .innerJoin(transactions, eq(transactions.id, postings.transactionId))
        .where(
          and(
            eq(postings.accountId, a.id),
            sql`${transactions.date} > ${iso(cycle.statementStart)}`,
            lte(transactions.date, iso(cycle.statementClose)),
          ),
        );

      // Payments made after the statement closed reduce what is still owed.
      const [since] = await db
        .select({
          paid: num(
            sql`coalesce(sum(case when ${postings.amountMinor} > 0 then ${postings.amountMinor} else 0 end), 0)`,
          ),
        })
        .from(postings)
        .innerJoin(transactions, eq(transactions.id, postings.transactionId))
        .where(
          and(
            eq(postings.accountId, a.id),
            sql`${transactions.date} > ${iso(cycle.statementClose)}`,
          ),
        );

      const statementMinor = Math.max(0, -(stmt?.net ?? 0));
      const paidSinceMinor = since?.paid ?? 0;
      const outstandingMinor = Math.max(0, statementMinor - paidSinceMinor);
      const u = utilisation(a.balanceMinor, card.creditLimitMinor);

      return {
        ...a,
        cardDetail: card,
        cycle,
        statementMinor,
        paidSinceMinor,
        outstandingMinor,
        settled: outstandingMinor === 0,
        minPaymentMinor: Math.round(
          (statementMinor * Number(card.minPaymentPct)) / 100,
        ),
        availableMinor: card.creditLimitMinor + a.balanceMinor,
        utilisation: u,
      };
    }),
  );
}

/* ────────────────────────────  budgets  ──────────────────────────── */

export type BudgetStatus = Awaited<ReturnType<typeof getBudgetStatus>>[number];

/**
 * Every budgeted category measured against its OWN current period — a weekly
 * budget against this week, a monthly one against this month. Comparing both
 * to the same window is the easy mistake here.
 */
export async function getBudgetStatus() {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.kind, "expense"), sql`${categories.budgetMinor} > 0`))
    .orderBy(categories.sortOrder, categories.name);

  if (rows.length === 0) return [];

  // One query per distinct period, not per category.
  const windows = new Map<string, { from: string; to: string }>();
  for (const r of rows) {
    if (!windows.has(r.budgetPeriod)) {
      windows.set(r.budgetPeriod, currentPeriod(r.budgetPeriod));
    }
  }

  const spendByPeriod = new Map<string, Map<number, number>>();
  for (const [period, w] of windows) {
    const spend = await db
      .select({
        categoryId: categories.id,
        spent: num(sql`coalesce(sum(${postings.baseAmountMinor}), 0)`),
      })
      .from(postings)
      .innerJoin(categories, eq(categories.id, postings.categoryId))
      .innerJoin(transactions, eq(transactions.id, postings.transactionId))
      .where(and(gte(transactions.date, w.from), lte(transactions.date, w.to)))
      .groupBy(categories.id);
    spendByPeriod.set(period, new Map(spend.map((r) => [r.categoryId, r.spent])));
  }

  return rows.map((c) => {
    const window = windows.get(c.budgetPeriod)!;
    const spent = spendByPeriod.get(c.budgetPeriod)?.get(c.id) ?? 0;
    return {
      id: c.id,
      name: c.name,
      icon: c.icon,
      budgetMinor: c.budgetMinor,
      period: c.budgetPeriod,
      window,
      spentMinor: spent,
      remainingMinor: c.budgetMinor - spent,
      ratio: c.budgetMinor > 0 ? spent / c.budgetMinor : 0,
      pace: periodProgress(c.budgetPeriod),
    };
  });
}

/* ────────────────────────────  people  ───────────────────────────── */

export async function getPeopleOverview() {
  const all = await getAccountsWithBalances({ includeArchived: true });
  const ledgers = all.filter(
    (a) => a.type === "receivable" || a.type === "payable",
  );

  const byPerson = new Map<
    number,
    {
      person: NonNullable<(typeof ledgers)[number]["person"]>;
      owedToYouBase: number;
      youOweBase: number;
      ledgers: typeof ledgers;
    }
  >();

  for (const l of ledgers) {
    if (!l.person) continue;
    const entry = byPerson.get(l.person.id) ?? {
      person: l.person,
      owedToYouBase: 0,
      youOweBase: 0,
      ledgers: [] as typeof ledgers,
    };
    if (l.type === "receivable") entry.owedToYouBase += l.baseBalanceMinor;
    else entry.youOweBase += -l.baseBalanceMinor;
    entry.ledgers.push(l);
    byPerson.set(l.person.id, entry);
  }

  return [...byPerson.values()]
    .map((e) => ({ ...e, netBase: e.owedToYouBase - e.youOweBase }))
    .sort((a, b) => Math.abs(b.netBase) - Math.abs(a.netBase));
}

export async function getCounterparties() {
  return db.select().from(counterparties).orderBy(counterparties.name);
}

/* ─────────────────────────  notifications  ───────────────────────── */

export async function getNotifications() {
  return db
    .select()
    .from(notifications)
    .where(sql`${notifications.dismissedAt} is null`)
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function getUnreadNotificationCount() {
  const [row] = await db
    .select({ count: num(sql`count(*)`) })
    .from(notifications)
    .where(sql`${notifications.readAt} is null and ${notifications.dismissedAt} is null`);
  return row?.count ?? 0;
}
