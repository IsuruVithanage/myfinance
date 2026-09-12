import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, postings, transactions } from "@/lib/db/schema";
import type { Currency, TxnType } from "@/lib/db/schema";
import { BASE_CURRENCY, getUsdLkrRate, toBaseMinor } from "@/lib/fx";

export class LedgerError extends Error {}

export type PostingInput = {
  accountId?: number | null;
  categoryId?: number | null;
  /** Signed, in `currency`'s minor units. + adds to the account. */
  amountMinor: number;
  currency: Currency;
  /** Supply only to override the derived conversion (exchange legs). */
  baseAmountMinor?: number;
  memo?: string | null;
};

export type TransactionInput = {
  date: string; // YYYY-MM-DD
  type: TxnType;
  description?: string;
  note?: string | null;
  counterpartyId?: number | null;
  expectedOn?: string | null;
  fxRate?: number | null;
  postings: PostingInput[];
};

/* ───────────────────────── balance invariant ─────────────────────── */

/**
 * Every transaction must balance in the base currency. Same-currency
 * transactions must also balance natively — a native imbalance there is
 * always a bug, never a legitimate FX effect.
 */
export function assertBalanced(
  type: TxnType,
  rows: Array<{ amountMinor: number; currency: Currency; baseAmountMinor: number }>,
) {
  if (rows.length < 2) {
    throw new LedgerError("A transaction needs at least two postings.");
  }

  const baseSum = rows.reduce((s, r) => s + r.baseAmountMinor, 0);
  if (baseSum !== 0) {
    throw new LedgerError(
      `Postings do not balance in ${BASE_CURRENCY}: off by ${baseSum} minor units.`,
    );
  }

  if (type !== "exchange") {
    const byCurrency = new Map<Currency, number>();
    for (const r of rows) {
      byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + r.amountMinor);
    }
    for (const [currency, sum] of byCurrency) {
      if (sum !== 0) {
        throw new LedgerError(
          `Postings do not balance in ${currency}: off by ${sum} minor units. ` +
            `Use an 'exchange' transaction to move money between currencies.`,
        );
      }
    }
  }
}

/* ──────────────────────────── core write ─────────────────────────── */

/** Insert a transaction and its postings atomically, or fail as a unit. */
export async function createTransaction(input: TransactionInput) {
  const rate = await getUsdLkrRate(input.date);

  const prepared = prepareExchangeBases(
    input.type,
    input.postings.map((p) => ({
      ...p,
      baseAmountMinor:
        p.baseAmountMinor ?? toBaseMinor(p.amountMinor, p.currency, rate),
    })),
  );

  assertBalanced(input.type, prepared);

  return db.transaction(async (tx) => {
    const [txn] = await tx
      .insert(transactions)
      .values({
        date: input.date,
        type: input.type,
        description: input.description ?? "",
        note: input.note ?? null,
        counterpartyId: input.counterpartyId ?? null,
        expectedOn: input.expectedOn ?? null,
        fxRate: input.fxRate != null ? String(input.fxRate) : null,
      })
      .returning();

    await tx.insert(postings).values(
      prepared.map((p) => ({
        transactionId: txn.id,
        accountId: p.accountId ?? null,
        categoryId: p.categoryId ?? null,
        amountMinor: p.amountMinor,
        currency: p.currency,
        baseAmountMinor: p.baseAmountMinor,
        memo: p.memo ?? null,
      })),
    );

    return txn;
  });
}

/** Replace a transaction's postings wholesale — simpler than diffing them. */
export async function updateTransaction(id: number, input: TransactionInput) {
  const rate = await getUsdLkrRate(input.date);
  const prepared = prepareExchangeBases(
    input.type,
    input.postings.map((p) => ({
      ...p,
      baseAmountMinor:
        p.baseAmountMinor ?? toBaseMinor(p.amountMinor, p.currency, rate),
    })),
  );
  assertBalanced(input.type, prepared);

  return db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({
        date: input.date,
        type: input.type,
        description: input.description ?? "",
        note: input.note ?? null,
        counterpartyId: input.counterpartyId ?? null,
        expectedOn: input.expectedOn ?? null,
        fxRate: input.fxRate != null ? String(input.fxRate) : null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id));

    await tx.delete(postings).where(eq(postings.transactionId, id));
    await tx.insert(postings).values(
      prepared.map((p) => ({
        transactionId: id,
        accountId: p.accountId ?? null,
        categoryId: p.categoryId ?? null,
        amountMinor: p.amountMinor,
        currency: p.currency,
        baseAmountMinor: p.baseAmountMinor,
        memo: p.memo ?? null,
      })),
    );
  });
}

export async function deleteTransaction(id: number) {
  // postings cascade
  await db.delete(transactions).where(eq(transactions.id, id));
}

/**
 * For an `exchange`, the real rate is whatever the two legs imply — not some
 * published mid-market number. We honour the base-currency legs as written and
 * let the foreign leg absorb the difference, so the transaction always balances
 * and the implied rate is exactly what the bank gave you.
 */
function prepareExchangeBases<
  T extends { currency: Currency; baseAmountMinor: number },
>(type: TxnType, rows: T[]): T[] {
  if (type !== "exchange") return rows;

  const foreign = rows.filter((r) => r.currency !== BASE_CURRENCY);
  if (foreign.length !== 1) return rows; // nothing sensible to infer

  const baseLegsTotal = rows
    .filter((r) => r.currency === BASE_CURRENCY)
    .reduce((s, r) => s + r.baseAmountMinor, 0);

  return rows.map((r) =>
    r === foreign[0] ? { ...r, baseAmountMinor: -baseLegsTotal } : r,
  );
}

/* ─────────────────────── transaction builders ────────────────────── */
/* Each one maps a user-facing action to balanced postings. The UI never
   constructs postings by hand.                                         */

async function currencyOf(accountId: number): Promise<Currency> {
  const [row] = await db
    .select({ currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!row) throw new LedgerError(`Account ${accountId} not found.`);
  return row.currency;
}


/**
 * Postings for a one-category spend or receipt, optionally with a fee.
 * Shared by the create and edit paths so they can never disagree.
 */
export function simplePostings(a: {
  type: "expense" | "income";
  accountId: number;
  categoryId: number;
  amountMinor: number;
  currency: Currency;
  feeMinor?: number;
  feeCategoryId?: number;
}): PostingInput[] {
  const fee = a.feeMinor ?? 0;
  const sign = a.type === "expense" ? 1 : -1;

  const rows: PostingInput[] = [
    {
      accountId: a.accountId,
      amountMinor:
        a.type === "expense" ? -(a.amountMinor + fee) : a.amountMinor - fee,
      currency: a.currency,
    },
    {
      categoryId: a.categoryId,
      amountMinor: sign * a.amountMinor,
      currency: a.currency,
    },
  ];

  if (fee > 0) {
    if (!a.feeCategoryId) throw new LedgerError("A fee needs a fee category.");
    rows.push({
      categoryId: a.feeCategoryId,
      amountMinor: fee,
      currency: a.currency,
      memo: "Fee",
    });
  }
  return rows;
}

/** Spend money. Optionally with a separate fee (ATM charge, card surcharge). */
export async function recordExpense(a: {
  date: string;
  accountId: number;
  categoryId: number;
  amountMinor: number; // positive
  description?: string;
  note?: string | null;
  feeMinor?: number;
  feeCategoryId?: number;
}) {
  const currency = await currencyOf(a.accountId);
  const rows = simplePostings({ ...a, type: "expense", currency });
  return createTransaction({
    date: a.date,
    type: "expense",
    description: a.description ?? "",
    note: a.note,
    postings: rows,
  });
}

/** Receive money — salary, refund, gift, interest. */
export async function recordIncome(a: {
  date: string;
  accountId: number;
  categoryId: number;
  amountMinor: number; // positive = gross
  description?: string;
  note?: string | null;
  feeMinor?: number;
  feeCategoryId?: number;
}) {
  const currency = await currencyOf(a.accountId);
  const rows = simplePostings({ ...a, type: "income", currency });
  return createTransaction({
    date: a.date,
    type: "income",
    description: a.description ?? "",
    note: a.note,
    postings: rows,
  });
}

/**
 * Move money between your own accounts in the SAME currency — including
 * paying a credit card bill, an ATM withdrawal, or a bank transfer that
 * carries a fee. `feePaidBy` says which side absorbs the charge.
 */
export async function recordTransfer(a: {
  date: string;
  fromAccountId: number;
  toAccountId: number;
  amountMinor: number; // what lands in the destination
  feeMinor?: number;
  feeCategoryId?: number;
  feePaidBy?: "source" | "destination";
  description?: string;
  note?: string | null;
}) {
  const [fromCurrency, toCurrency] = await Promise.all([
    currencyOf(a.fromAccountId),
    currencyOf(a.toAccountId),
  ]);
  if (fromCurrency !== toCurrency) {
    throw new LedgerError(
      "Those accounts hold different currencies — record it as an exchange.",
    );
  }
  const fee = a.feeMinor ?? 0;
  const paidBy = a.feePaidBy ?? "source";

  const rows: PostingInput[] = [
    {
      accountId: a.fromAccountId,
      amountMinor: -(paidBy === "source" ? a.amountMinor + fee : a.amountMinor),
      currency: fromCurrency,
    },
    {
      accountId: a.toAccountId,
      amountMinor: paidBy === "source" ? a.amountMinor : a.amountMinor - fee,
      currency: toCurrency,
    },
  ];
  if (fee > 0) {
    if (!a.feeCategoryId) throw new LedgerError("A fee needs a fee category.");
    rows.push({
      categoryId: a.feeCategoryId,
      amountMinor: fee,
      currency: fromCurrency,
      memo: "Transfer fee",
    });
  }
  return createTransaction({
    date: a.date,
    type: "transfer",
    description: a.description ?? "",
    note: a.note,
    postings: rows,
  });
}

/**
 * Convert between LKR and USD. You enter what left and what arrived; the
 * implied rate is recorded so your reports reflect the rate you actually got.
 */
export async function recordExchange(a: {
  date: string;
  fromAccountId: number;
  toAccountId: number;
  /** Total debited from the source, fee included when charged in its currency. */
  fromAmountMinor: number;
  /** What actually landed in the destination account. */
  toAmountMinor: number;
  feeMinor?: number;
  feeCategoryId?: number;
  /** Currency the fee was charged in. Defaults to the source account's. */
  feeCurrency?: Currency;
  description?: string;
  note?: string | null;
}) {
  const [fromCurrency, toCurrency] = await Promise.all([
    currencyOf(a.fromAccountId),
    currencyOf(a.toAccountId),
  ]);
  if (fromCurrency === toCurrency) {
    throw new LedgerError(
      "Both accounts hold the same currency — record it as a transfer.",
    );
  }
  const fee = a.feeMinor ?? 0;
  const rows: PostingInput[] = [
    { accountId: a.fromAccountId, amountMinor: -a.fromAmountMinor, currency: fromCurrency },
    { accountId: a.toAccountId, amountMinor: a.toAmountMinor, currency: toCurrency },
  ];
  if (fee > 0) {
    if (!a.feeCategoryId) throw new LedgerError("A fee needs a fee category.");
    rows.push({
      categoryId: a.feeCategoryId,
      amountMinor: fee,
      currency: a.feeCurrency ?? fromCurrency,
      memo: "Exchange fee",
    });
  }

  // The rate you actually got = every LKR-denominated leg (proceeds plus any
  // LKR fee) divided by the USD that changed hands. Matches how the foreign
  // leg's base amount is derived in prepareExchangeBases, so the two agree.
  const usdLeg = fromCurrency === "USD" ? a.fromAmountMinor : a.toAmountMinor;
  const lkrSum = rows
    .filter((r) => r.currency === "LKR")
    .reduce((s, r) => s + r.amountMinor, 0);
  const impliedRate = usdLeg > 0 ? Math.abs(lkrSum) / usdLeg : null;

  return createTransaction({
    date: a.date,
    type: "exchange",
    description: a.description ?? "",
    note: a.note,
    fxRate: impliedRate,
    postings: rows,
  });
}

/**
 * People. Lending is not an expense — the money is still yours, it just moved
 * into a receivable. Borrowing is not income. Only interest hits a category.
 */
export async function recordPeopleMove(a: {
  date: string;
  type: "lend" | "collect" | "borrow" | "settle";
  /** Your own cash/bank account the money moves through. */
  accountId: number;
  /** The person's receivable (lend/collect) or payable (borrow/settle) account. */
  ledgerAccountId: number;
  counterpartyId: number;
  amountMinor: number; // positive
  /** Interest earned (collect) or paid (settle), same currency. */
  interestMinor?: number;
  interestCategoryId?: number;
  expectedOn?: string | null;
  description?: string;
  note?: string | null;
}) {
  const [accountCurrency, ledgerCurrency] = await Promise.all([
    currencyOf(a.accountId),
    currencyOf(a.ledgerAccountId),
  ]);
  if (accountCurrency !== ledgerCurrency) {
    throw new LedgerError(
      "The person's ledger must use the same currency as the account paying out.",
    );
  }
  const currency = accountCurrency;
  const interest = a.interestMinor ?? 0;

  // moneyOut: does cash leave your pocket?
  const moneyOut = a.type === "lend" || a.type === "settle";
  const cashDelta = moneyOut ? -(a.amountMinor + (a.type === "settle" ? interest : 0))
                             : a.amountMinor + (a.type === "collect" ? interest : 0);
  // The person's ledger only ever moves by the principal.
  const ledgerDelta =
    a.type === "lend" ? a.amountMinor
    : a.type === "collect" ? -a.amountMinor
    : a.type === "borrow" ? -a.amountMinor
    : a.amountMinor; // settle

  const rows: PostingInput[] = [
    { accountId: a.accountId, amountMinor: cashDelta, currency },
    { accountId: a.ledgerAccountId, amountMinor: ledgerDelta, currency },
  ];

  if (interest > 0) {
    if (!a.interestCategoryId)
      throw new LedgerError("Interest needs an income or expense category.");
    // collect → interest is income (negative posting); settle → expense (positive)
    rows.push({
      categoryId: a.interestCategoryId,
      amountMinor: a.type === "collect" ? -interest : interest,
      currency,
      memo: "Interest",
    });
  }

  return createTransaction({
    date: a.date,
    type: a.type,
    description: a.description ?? "",
    note: a.note,
    counterpartyId: a.counterpartyId,
    expectedOn: a.expectedOn,
    postings: rows,
  });
}

/**
 * Reconcile: you counted your wallet and it disagrees with the app. Books the
 * difference to a category so it stays visible instead of vanishing.
 */
export async function recordAdjustment(a: {
  date: string;
  accountId: number;
  /** Signed difference to apply to the account. */
  deltaMinor: number;
  categoryId: number;
  note?: string | null;
}) {
  const currency = await currencyOf(a.accountId);
  return createTransaction({
    date: a.date,
    type: "adjustment",
    description: "Balance adjustment",
    note: a.note,
    postings: [
      { accountId: a.accountId, amountMinor: a.deltaMinor, currency },
      { categoryId: a.categoryId, amountMinor: -a.deltaMinor, currency },
    ],
  });
}

/**
 * Re-state a simple expense or income. Postings are rebuilt from scratch, so a
 * corrected amount can never leave a stale leg behind.
 */
export async function updateSimpleTransaction(
  id: number,
  a: {
    date: string;
    type: "expense" | "income";
    accountId: number;
    categoryId: number;
    amountMinor: number;
    description?: string;
    note?: string | null;
    feeMinor?: number;
    feeCategoryId?: number;
  },
) {
  const currency = await currencyOf(a.accountId);
  return updateTransaction(id, {
    date: a.date,
    type: a.type,
    description: a.description ?? "",
    note: a.note ?? null,
    postings: simplePostings({ ...a, currency }),
  });
}
