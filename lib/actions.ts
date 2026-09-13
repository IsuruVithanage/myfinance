"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  accounts,
  cardDetails,
  categories,
  counterparties,
  fxRates,
  notifications,
  settings,
  transactions,
} from "@/lib/db/schema";
import type { Currency } from "@/lib/db/schema";
import {
  LedgerError,
  deleteTransaction as deleteTxn,
  recordAdjustment,
  recordExchange,
  recordExpense,
  recordIncome,
  recordPeopleMove,
  recordTransfer,
  updateSimpleTransaction,
} from "@/lib/ledger";
import { refreshNotifications } from "@/lib/notifications";
import { refreshUsdLkrRate } from "@/lib/fx-feed";
import {
  PeopleError,
  deleteAccount as deleteAccountRow,
  deleteCounterparty,
  mergeCounterparties,
} from "@/lib/people";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type ActionResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

/** Every mutation goes through here. No valid session, no write. */
async function requireSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(process.env.AUTH_SECRET, token))) {
    throw new Error("Locked. Enter your passcode again.");
  }
}

function fail(e: unknown): ActionResult {
  if (e instanceof LedgerError || e instanceof PeopleError)
    return { ok: false, error: e.message };
  const message = e instanceof Error ? e.message : "Something went wrong.";
  console.error("[action]", e);
  return { ok: false, error: message };
}

function refreshAll() {
  for (const p of ["/", "/accounts", "/cards", "/people", "/transactions", "/reports"])
    revalidatePath(p);
}

/* ───────────────────────────── accounts ──────────────────────────── */

const accountSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Give the account a name."),
  type: z.enum([
    "cash",
    "bank",
    "savings",
    "credit_card",
    "wallet",
    "investment",
  ]),
  currency: z.enum(["LKR", "USD"]),
  openingBalanceMinor: z.number().int().default(0),
  institution: z.string().nullish(),
  last4: z.string().nullish(),
  color: z.string().default("#6366f1"),
  icon: z.string().default("wallet"),
  includeInNetWorth: z.boolean().default(true),
  card: z
    .object({
      creditLimitMinor: z.number().int().nonnegative(),
      statementDay: z.number().int().min(1).max(31),
      dueDay: z.number().int().min(1).max(31),
      dueMonthOffset: z.number().int().min(0).max(2).default(1),
      minPaymentPct: z.number().min(0).max(100).default(5),
      aprBp: z.number().int().min(0).default(0),
      alertDaysBefore: z.number().int().min(0).max(30).default(7),
    })
    .nullish(),
});

export async function saveAccount(
  input: z.input<typeof accountSchema>,
): Promise<ActionResult> {
  try {
    await requireSession();
    const a = accountSchema.parse(input);

    if (a.type === "credit_card" && !a.card) {
      return { ok: false, error: "A credit card needs its statement and due day." };
    }

    let accountId = a.id;
    if (accountId) {
      await db
        .update(accounts)
        .set({
          name: a.name,
          type: a.type,
          currency: a.currency,
          openingBalanceMinor: a.openingBalanceMinor,
          institution: a.institution ?? null,
          last4: a.last4 ?? null,
          color: a.color,
          icon: a.icon,
          includeInNetWorth: a.includeInNetWorth,
        })
        .where(eq(accounts.id, accountId));
    } else {
      const [row] = await db
        .insert(accounts)
        .values({
          name: a.name,
          type: a.type,
          currency: a.currency,
          openingBalanceMinor: a.openingBalanceMinor,
          institution: a.institution ?? null,
          last4: a.last4 ?? null,
          color: a.color,
          icon: a.icon,
          includeInNetWorth: a.includeInNetWorth,
        })
        .returning();
      accountId = row.id;
    }

    if (a.type === "credit_card" && a.card) {
      await db
        .insert(cardDetails)
        .values({
          accountId: accountId!,
          creditLimitMinor: a.card.creditLimitMinor,
          statementDay: a.card.statementDay,
          dueDay: a.card.dueDay,
          dueMonthOffset: a.card.dueMonthOffset,
          minPaymentPct: String(a.card.minPaymentPct),
          aprBp: a.card.aprBp,
          alertDaysBefore: a.card.alertDaysBefore,
        })
        .onConflictDoUpdate({
          target: cardDetails.accountId,
          set: {
            creditLimitMinor: a.card.creditLimitMinor,
            statementDay: a.card.statementDay,
            dueDay: a.card.dueDay,
            dueMonthOffset: a.card.dueMonthOffset,
            minPaymentPct: String(a.card.minPaymentPct),
            aprBp: a.card.aprBp,
            alertDaysBefore: a.card.alertDaysBefore,
          },
        });
    } else if (accountId) {
      await db.delete(cardDetails).where(eq(cardDetails.accountId, accountId));
    }

    refreshAll();
    return { ok: true, id: accountId };
  } catch (e) {
    return fail(e);
  }
}

export async function setAccountActive(
  id: number,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    await requireSession();
    await db.update(accounts).set({ isActive }).where(eq(accounts.id, id));
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ────────────────────────────── people ───────────────────────────── */

export async function savePerson(input: {
  id?: number;
  name: string;
  phone?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  try {
    await requireSession();
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Give the person a name." };

    if (input.id) {
      await db
        .update(counterparties)
        .set({ name, phone: input.phone ?? null, notes: input.notes ?? null })
        .where(eq(counterparties.id, input.id));
      refreshAll();
      return { ok: true, id: input.id };
    }
    const [row] = await db
      .insert(counterparties)
      .values({ name, phone: input.phone ?? null, notes: input.notes ?? null })
      .returning();
    refreshAll();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

/** Fold a duplicate person into the one you are keeping. */
export async function mergePeople(
  fromId: number,
  intoId: number,
): Promise<ActionResult> {
  try {
    await requireSession();
    const r = await mergeCounterparties(fromId, intoId);
    refreshAll();
    revalidatePath("/people");
    return { ok: true, id: intoId, ...r } as ActionResult;
  } catch (e) {
    return fail(e);
  }
}

/** Remove a person. Refused if anything still references them. */
export async function removePerson(id: number): Promise<ActionResult> {
  try {
    await requireSession();
    await deleteCounterparty(id);
    refreshAll();
    revalidatePath("/people");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Permanently remove an account. Refused once postings exist. */
export async function removeAccount(id: number): Promise<ActionResult> {
  try {
    await requireSession();
    await deleteAccountRow(id);
    refreshAll();
    revalidatePath("/accounts");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * A person's receivable/payable ledger is created on first use, one per
 * currency — so someone can owe you USD and LKR without the two mixing.
 */
async function ensurePersonLedger(
  counterpartyId: number,
  kind: "receivable" | "payable",
  currency: Currency,
) {
  const [existing] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.counterpartyId, counterpartyId),
        eq(accounts.type, kind),
        eq(accounts.currency, currency),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [person] = await db
    .select()
    .from(counterparties)
    .where(eq(counterparties.id, counterpartyId))
    .limit(1);

  const [row] = await db
    .insert(accounts)
    .values({
      name: `${person?.name ?? "Person"} — ${kind === "receivable" ? "owes me" : "I owe"} (${currency})`,
      type: kind,
      currency,
      counterpartyId,
      icon: kind === "receivable" ? "hand-coins" : "handshake",
      color: kind === "receivable" ? "#0891b2" : "#c2410c",
    })
    .returning();
  return row.id;
}

/* ──────────────────────────── categories ─────────────────────────── */

export async function saveCategory(input: {
  id?: number;
  name: string;
  kind: "expense" | "income";
  icon?: string;
  color?: string;
  budgetMinor?: number;
  budgetPeriod?: "weekly" | "monthly";
}): Promise<ActionResult> {
  try {
    await requireSession();
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Give the category a name." };

    const values = {
      name,
      kind: input.kind,
      icon: input.icon ?? "tag",
      color: input.color ?? "#64748b",
      budgetMinor: input.budgetMinor ?? 0,
      budgetPeriod: input.budgetPeriod ?? "monthly",
    };

    if (input.id) {
      await db.update(categories).set(values).where(eq(categories.id, input.id));
      refreshAll();
      return { ok: true, id: input.id };
    }
    const [row] = await db.insert(categories).values(values).returning();
    refreshAll();
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveCategory(id: number): Promise<ActionResult> {
  try {
    await requireSession();
    const [c] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    if (c?.isSystem)
      return { ok: false, error: "Built-in categories can't be removed." };
    await db
      .update(categories)
      .set({ archivedAt: new Date() })
      .where(eq(categories.id, id));
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────────────────────── transactions ────────────────────────── */

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().default(""),
  note: z.string().nullish(),
  amountMinor: z.number().int().positive("Enter an amount."),
  feeMinor: z.number().int().nonnegative().default(0),
  feeCategoryId: z.number().int().nullish(),
});

export async function addExpense(
  input: z.input<typeof entrySchema> & { accountId: number; categoryId: number },
): Promise<ActionResult> {
  try {
    await requireSession();
    const e = entrySchema.parse(input);
    const txn = await recordExpense({
      ...e,
      note: e.note ?? null,
      accountId: input.accountId,
      categoryId: input.categoryId,
      feeMinor: e.feeMinor,
      feeCategoryId: e.feeCategoryId ?? undefined,
    });
    refreshAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addIncome(
  input: z.input<typeof entrySchema> & { accountId: number; categoryId: number },
): Promise<ActionResult> {
  try {
    await requireSession();
    const e = entrySchema.parse(input);
    const txn = await recordIncome({
      ...e,
      note: e.note ?? null,
      accountId: input.accountId,
      categoryId: input.categoryId,
      feeMinor: e.feeMinor,
      feeCategoryId: e.feeCategoryId ?? undefined,
    });
    refreshAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addTransfer(
  input: z.input<typeof entrySchema> & {
    fromAccountId: number;
    toAccountId: number;
    feePaidBy?: "source" | "destination";
  },
): Promise<ActionResult> {
  try {
    await requireSession();
    const e = entrySchema.parse(input);
    if (input.fromAccountId === input.toAccountId)
      return { ok: false, error: "Pick two different accounts." };
    const txn = await recordTransfer({
      ...e,
      note: e.note ?? null,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      feeMinor: e.feeMinor,
      feeCategoryId: e.feeCategoryId ?? undefined,
      feePaidBy: input.feePaidBy,
    });
    refreshAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addExchange(input: {
  date: string;
  description?: string;
  note?: string | null;
  fromAccountId: number;
  toAccountId: number;
  fromAmountMinor: number;
  toAmountMinor: number;
  feeMinor?: number;
  feeCategoryId?: number | null;
  feeCurrency?: Currency;
}): Promise<ActionResult> {
  try {
    await requireSession();
    if (input.fromAmountMinor <= 0 || input.toAmountMinor <= 0)
      return { ok: false, error: "Enter both the amount sent and received." };
    const txn = await recordExchange({
      ...input,
      note: input.note ?? null,
      feeCategoryId: input.feeCategoryId ?? undefined,
    });
    refreshAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addPeopleMove(input: {
  date: string;
  type: "lend" | "collect" | "borrow" | "settle";
  accountId: number;
  counterpartyId: number;
  amountMinor: number;
  interestMinor?: number;
  interestCategoryId?: number | null;
  expectedOn?: string | null;
  description?: string;
  note?: string | null;
}): Promise<ActionResult> {
  try {
    await requireSession();
    if (input.amountMinor <= 0) return { ok: false, error: "Enter an amount." };

    const [account] = await db
      .select({ currency: accounts.currency })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .limit(1);
    if (!account) return { ok: false, error: "Account not found." };

    const kind =
      input.type === "lend" || input.type === "collect" ? "receivable" : "payable";
    const ledgerAccountId = await ensurePersonLedger(
      input.counterpartyId,
      kind,
      account.currency,
    );

    const txn = await recordPeopleMove({
      ...input,
      note: input.note ?? null,
      ledgerAccountId,
      interestMinor: input.interestMinor,
      interestCategoryId: input.interestCategoryId ?? undefined,
    });
    refreshAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addAdjustment(input: {
  date: string;
  accountId: number;
  /** The balance you actually counted, in minor units. */
  countedMinor: number;
  currentMinor: number;
  note?: string | null;
}): Promise<ActionResult> {
  try {
    await requireSession();
    const delta = input.countedMinor - input.currentMinor;
    if (delta === 0) return { ok: false, error: "That already matches." };

    const [adjust] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.name, "Adjustment"), eq(categories.isSystem, true)))
      .limit(1);
    if (!adjust)
      return { ok: false, error: "Adjustment category missing — run the seed." };

    const txn = await recordAdjustment({
      date: input.date,
      accountId: input.accountId,
      deltaMinor: delta,
      categoryId: adjust.id,
      note: input.note ?? null,
    });
    refreshAll();
    return { ok: true, id: txn.id };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Correct a simple expense or income. Only these two shapes are editable in
 * place — transfers, exchanges and lending move two real balances, where a
 * silent re-stating is more dangerous than deleting and re-entering.
 */
export async function editTransaction(input: {
  id: number;
  date: string;
  type: "expense" | "income";
  accountId: number;
  categoryId: number;
  amountMinor: number;
  description?: string;
  note?: string | null;
  feeMinor?: number;
  feeCategoryId?: number | null;
}): Promise<ActionResult> {
  try {
    await requireSession();
    if (input.amountMinor <= 0) return { ok: false, error: "Enter an amount." };

    await updateSimpleTransaction(input.id, {
      date: input.date,
      type: input.type,
      accountId: input.accountId,
      categoryId: input.categoryId,
      amountMinor: input.amountMinor,
      description: input.description,
      note: input.note ?? null,
      feeMinor: input.feeMinor,
      feeCategoryId: input.feeCategoryId ?? undefined,
    });
    refreshAll();
    return { ok: true, id: input.id };
  } catch (e) {
    return fail(e);
  }
}

/** Date, description and note only — safe for every transaction type. */
export async function editTransactionDetails(input: {
  id: number;
  date: string;
  description: string;
  note?: string | null;
}): Promise<ActionResult> {
  try {
    await requireSession();
    await db
      .update(transactions)
      .set({
        date: input.date,
        description: input.description,
        note: input.note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, input.id));
    refreshAll();
    return { ok: true, id: input.id };
  } catch (e) {
    return fail(e);
  }
}

export async function removeTransaction(id: number): Promise<ActionResult> {
  try {
    await requireSession();
    await deleteTxn(id);
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** A cap on total spending for a week or a month. 0 clears it. */
export async function setOverallBudget(
  period: "weekly" | "monthly",
  amountMinor: number,
): Promise<ActionResult> {
  try {
    await requireSession();
    if (amountMinor < 0) return { ok: false, error: "Enter a positive amount." };

    const column =
      period === "weekly"
        ? { weeklyBudgetMinor: amountMinor }
        : { monthlyBudgetMinor: amountMinor };

    await db
      .insert(settings)
      .values({ id: 1, ...column })
      .onConflictDoUpdate({
        target: settings.id,
        set: { ...column, updatedAt: new Date() },
      });

    refreshAll();
    revalidatePath("/budgets");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────────────────────── fx & settings ───────────────────────── */

export async function setUsdLkrRate(
  date: string,
  rate: number,
): Promise<ActionResult> {
  try {
    await requireSession();
    if (!(rate > 0)) return { ok: false, error: "Enter a rate above zero." };
    await db
      .insert(fxRates)
      .values({ date, base: "USD", quote: "LKR", rate: String(rate), source: "manual" })
      .onConflictDoUpdate({
        target: [fxRates.date, fxRates.base, fxRates.quote],
        set: { rate: String(rate) },
      });
    await db
      .insert(settings)
      .values({ id: 1, fallbackUsdLkr: String(rate) })
      .onConflictDoUpdate({
        target: settings.id,
        set: { fallbackUsdLkr: String(rate), updatedAt: new Date() },
      });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Pull the live USD→LKR rate now, ignoring the once-a-day throttle. */
export async function refreshFxRate(): Promise<ActionResult> {
  try {
    await requireSession();
    const result = await refreshUsdLkrRate({ force: true });
    if (!result) {
      return {
        ok: false,
        error: "Couldn't reach the rate providers. The saved rate is still in use.",
      };
    }
    refreshAll();
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ────────────────────────── notifications ────────────────────────── */

export async function refreshAlerts(): Promise<ActionResult> {
  try {
    await requireSession();
    await refreshNotifications(true);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markAlertsRead(): Promise<ActionResult> {
  try {
    await requireSession();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(sql`${notifications.readAt} is null`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function dismissAlert(id: number): Promise<ActionResult> {
  try {
    await requireSession();
    await db
      .update(notifications)
      .set({ dismissedAt: new Date() })
      .where(eq(notifications.id, id));
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
