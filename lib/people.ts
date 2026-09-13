import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, counterparties, postings, transactions } from "@/lib/db/schema";

export class PeopleError extends Error {}

/* ─────────────────────────── merging ─────────────────────────────── */

/**
 * Fold one person into another — the same human entered twice.
 *
 * Their ledgers are merged per currency and per direction: if both records owe
 * in LKR, the postings move onto the surviving account and the empty one goes.
 * If only the source has a USD ledger, that account is simply reassigned. Every
 * transaction tagged with the old person is retagged.
 *
 * Nothing is deleted until the references are moved, and the whole thing runs
 * in one transaction, so a failure leaves both people exactly as they were.
 */
export async function mergeCounterparties(fromId: number, intoId: number) {
  if (fromId === intoId) {
    throw new PeopleError("Pick two different people.");
  }

  return db.transaction(async (tx) => {
    const [from] = await tx
      .select()
      .from(counterparties)
      .where(eq(counterparties.id, fromId))
      .limit(1);
    const [into] = await tx
      .select()
      .from(counterparties)
      .where(eq(counterparties.id, intoId))
      .limit(1);

    if (!from || !into) throw new PeopleError("One of those people no longer exists.");

    const fromAccounts = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.counterpartyId, fromId));
    const intoAccounts = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.counterpartyId, intoId));

    for (const source of fromAccounts) {
      const target = intoAccounts.find(
        (a) => a.type === source.type && a.currency === source.currency,
      );

      if (target) {
        // Same direction and currency: move the postings across, carry any
        // opening balance, then drop the now-empty account.
        await tx
          .update(postings)
          .set({ accountId: target.id })
          .where(eq(postings.accountId, source.id));

        if (source.openingBalanceMinor !== 0) {
          await tx
            .update(accounts)
            .set({
              openingBalanceMinor:
                target.openingBalanceMinor + source.openingBalanceMinor,
            })
            .where(eq(accounts.id, target.id));
        }

        await tx.delete(accounts).where(eq(accounts.id, source.id));
      } else {
        // No counterpart: reassign it, and rename so it reads correctly.
        await tx
          .update(accounts)
          .set({
            counterpartyId: intoId,
            name: `${into.name} — ${source.type === "receivable" ? "owes me" : "I owe"} (${source.currency})`,
          })
          .where(eq(accounts.id, source.id));
      }
    }

    await tx
      .update(transactions)
      .set({ counterpartyId: intoId })
      .where(eq(transactions.counterpartyId, fromId));

    await tx.delete(counterparties).where(eq(counterparties.id, fromId));

    return { mergedName: from.name, into: into.name };
  });
}

/* ─────────────────────────── deleting ────────────────────────────── */

/** What still points at a person, so the UI can explain a refusal. */
export async function personUsage(id: number) {
  const [txn] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.counterpartyId, id));

  const [leg] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postings)
    .innerJoin(accounts, eq(accounts.id, postings.accountId))
    .where(eq(accounts.counterpartyId, id));

  const ledgers = await db
    .select()
    .from(accounts)
    .where(eq(accounts.counterpartyId, id));

  const outstanding = ledgers.reduce((s, a) => s + a.openingBalanceMinor, 0);

  return {
    transactions: txn?.n ?? 0,
    postings: leg?.n ?? 0,
    ledgers: ledgers.length,
    hasHistory: (txn?.n ?? 0) > 0 || (leg?.n ?? 0) > 0 || outstanding !== 0,
  };
}

/**
 * Remove a person entirely. Only allowed when nothing references them —
 * deleting someone with history would either orphan transactions or quietly
 * rewrite balances, and neither is acceptable in a ledger.
 */
export async function deleteCounterparty(id: number) {
  const usage = await personUsage(id);
  if (usage.hasHistory) {
    throw new PeopleError(
      "That person has money history. Merge them into another person, or settle up first.",
    );
  }

  return db.transaction(async (tx) => {
    // Empty ledger accounts only; postings would have been caught above.
    await tx.delete(accounts).where(eq(accounts.counterpartyId, id));
    await tx.delete(counterparties).where(eq(counterparties.id, id));
  });
}

/* ─────────────────────── account deletion ────────────────────────── */

export async function accountUsage(id: number) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postings)
    .where(eq(postings.accountId, id));
  return { postings: row?.n ?? 0 };
}

/**
 * Permanently remove an account. Refuses once anything has moved through it:
 * those postings are the other half of real transactions, and dropping them
 * would leave the ledger unbalanced. Archive such accounts instead.
 */
export async function deleteAccount(id: number) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  if (!account) throw new PeopleError("That account no longer exists.");

  const usage = await accountUsage(id);
  if (usage.postings > 0) {
    throw new PeopleError(
      `${usage.postings} transaction${usage.postings === 1 ? "" : "s"} moved through this account. ` +
        "Archive it instead — deleting it would unbalance those entries.",
    );
  }

  await db.delete(accounts).where(eq(accounts.id, id));
  return { name: account.name };
}

/** People who could absorb this one, for the merge picker. */
export async function mergeCandidates(excludeId: number) {
  return db
    .select({ id: counterparties.id, name: counterparties.name })
    .from(counterparties)
    .where(and(sql`${counterparties.id} <> ${excludeId}`))
    .orderBy(counterparties.name);
}
