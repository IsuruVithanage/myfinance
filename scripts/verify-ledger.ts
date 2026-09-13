import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../lib/db";
import {
  accounts,
  cardDetails,
  categories,
  counterparties,
  postings,
  transactions,
} from "../lib/db/schema";
import {
  recordAdjustment,
  recordExchange,
  recordExpense,
  recordIncome,
  recordPeopleMove,
  recordTransfer,
} from "../lib/ledger";
import {
  getAccountsWithBalances,
  getCardsOverview,
  getNetWorth,
  getPeopleOverview,
  getPeriodTotals,
} from "../lib/queries";
import { formatMoney } from "../lib/money";

/**
 * This script deletes every transaction, posting and account before replaying
 * its fixtures. That is fine against a scratch database and catastrophic
 * against a real one, so refuse to run anywhere that is not obviously local
 * unless the caller says so out loud.
 */
function guardAgainstRealData() {
  const url = process.env.DATABASE_URL ?? "";
  const local =
    url.includes("@localhost") ||
    url.includes("@127.0.0.1") ||
    url.includes("sslmode=disable");

  if (local || process.env.I_KNOW_THIS_WIPES_DATA === "yes") return;

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "(unparseable)";
    }
  })();

  console.error(
    [
      "",
      "  Refusing to run: this wipes all transactional data.",
      `  DATABASE_URL points at ${host}, which is not a local database.`,
      "",
      "  Run it against a scratch database instead:",
      "    DATABASE_URL='postgresql://…/scratch' npx tsx scripts/verify-ledger.ts",
      "",
      "  If you genuinely mean to wipe that database, set",
      "    I_KNOW_THIS_WIPES_DATA=yes",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

guardAgainstRealData();

let failures = 0;

function check(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? "✓" : "✗"} ${label.padEnd(44)} ${String(actual).padStart(12)}` +
      (ok ? "" : `   expected ${expected}`),
  );
}

async function categoryId(name: string) {
  const [c] = await db
    .select()
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1);
  if (!c) throw new Error(`category "${name}" missing — run npm run seed`);
  return c.id;
}

async function main() {
  // repeatable: clear transactional data, keep categories/settings
  await db.delete(postings);
  await db.delete(transactions);
  await db.delete(cardDetails);
  await db.delete(accounts);
  await db.delete(counterparties);

  const [wallet] = await db
    .insert(accounts)
    .values({
      name: "Cash Wallet",
      type: "cash",
      currency: "LKR",
      openingBalanceMinor: 2_000_00,
    })
    .returning();
  const [bank] = await db
    .insert(accounts)
    .values({
      name: "Sampath Current",
      type: "bank",
      currency: "LKR",
      openingBalanceMinor: 50_000_00,
    })
    .returning();
  const [usd] = await db
    .insert(accounts)
    .values({
      name: "USD Savings",
      type: "savings",
      currency: "USD",
      openingBalanceMinor: 1_000_00,
    })
    .returning();
  const [card] = await db
    .insert(accounts)
    .values({ name: "Amex Gold", type: "credit_card", currency: "LKR" })
    .returning();
  await db.insert(cardDetails).values({
    accountId: card.id,
    creditLimitMinor: 200_000_00,
    statementDay: 25,
    dueDay: 15,
    aprBp: 2400,
  });

  const [kamal] = await db
    .insert(counterparties)
    .values({ name: "Kamal" })
    .returning();
  const [kamalRecv] = await db
    .insert(accounts)
    .values({
      name: "Kamal (owes me)",
      type: "receivable",
      currency: "LKR",
      counterpartyId: kamal.id,
    })
    .returning();
  const [nimal] = await db
    .insert(counterparties)
    .values({ name: "Nimal" })
    .returning();
  const [nimalPay] = await db
    .insert(accounts)
    .values({
      name: "Nimal (I owe)",
      type: "payable",
      currency: "LKR",
      counterpartyId: nimal.id,
    })
    .returning();

  const groceries = await categoryId("Groceries");
  const dining = await categoryId("Dining Out");
  const salary = await categoryId("Salary");
  const bankFees = await categoryId("Bank Fees");
  const interestIn = await categoryId("Interest Income");
  const adjust = await categoryId("Adjustment");

  console.log("\n── recording ──");

  // 1. plain expense from the wallet
  await recordExpense({
    date: "2026-09-01",
    accountId: wallet.id,
    categoryId: groceries,
    amountMinor: 4_500_00,
    description: "Keells",
  });

  // 2. salary into the bank
  await recordIncome({
    date: "2026-09-01",
    accountId: bank.id,
    categoryId: salary,
    amountMinor: 150_000_00,
    description: "September salary",
  });

  // 3. ATM withdrawal: bank → wallet, LKR 55 fee paid by the source
  await recordTransfer({
    date: "2026-09-02",
    fromAccountId: bank.id,
    toAccountId: wallet.id,
    amountMinor: 10_000_00,
    feeMinor: 55_00,
    feeCategoryId: bankFees,
    description: "ATM",
  });

  // 4. card purchase
  await recordExpense({
    date: "2026-09-03",
    accountId: card.id,
    categoryId: dining,
    amountMinor: 2_500_00,
    description: "Dinner",
  });

  // 5. paying part of the card bill from the bank
  await recordTransfer({
    date: "2026-09-04",
    fromAccountId: bank.id,
    toAccountId: card.id,
    amountMinor: 1_500_00,
    description: "Card payment",
  });

  // 6. USD 100 sold at 300 with a LKR 150 charge → LKR 29,850 credited
  await recordExchange({
    date: "2026-09-05",
    fromAccountId: usd.id,
    toAccountId: bank.id,
    fromAmountMinor: 100_00,
    toAmountMinor: 29_850_00,
    feeMinor: 150_00,
    feeCategoryId: bankFees,
    feeCurrency: "LKR",
    description: "Sold USD",
  });

  // 7. lend, then a partial repayment with interest
  await recordPeopleMove({
    date: "2026-09-06",
    type: "lend",
    accountId: wallet.id,
    ledgerAccountId: kamalRecv.id,
    counterpartyId: kamal.id,
    amountMinor: 5_000_00,
    expectedOn: "2026-09-20",
    description: "Lent to Kamal",
  });
  await recordPeopleMove({
    date: "2026-09-10",
    type: "collect",
    accountId: wallet.id,
    ledgerAccountId: kamalRecv.id,
    counterpartyId: kamal.id,
    amountMinor: 3_000_00,
    interestMinor: 200_00,
    interestCategoryId: interestIn,
    description: "Kamal repaid part",
  });

  // 8. borrow and part-settle
  await recordPeopleMove({
    date: "2026-09-07",
    type: "borrow",
    accountId: bank.id,
    ledgerAccountId: nimalPay.id,
    counterpartyId: nimal.id,
    amountMinor: 20_000_00,
    description: "Borrowed from Nimal",
  });
  await recordPeopleMove({
    date: "2026-09-11",
    type: "settle",
    accountId: bank.id,
    ledgerAccountId: nimalPay.id,
    counterpartyId: nimal.id,
    amountMinor: 8_000_00,
    description: "Paid Nimal back",
  });

  // 9. wallet recount: LKR 120 missing
  await recordAdjustment({
    date: "2026-09-12",
    accountId: wallet.id,
    deltaMinor: -120_00,
    categoryId: adjust,
    note: "Counted the wallet",
  });

  console.log("\n── balances ──");
  const all = await getAccountsWithBalances({ includeArchived: true });
  const by = (id: number) => all.find((a) => a.id === id)!;

  check(
    "wallet",
    by(wallet.id).balanceMinor,
    2_000_00 - 4_500_00 + 10_000_00 - 5_000_00 + 3_200_00 - 120_00,
  );
  check(
    "bank",
    by(bank.id).balanceMinor,
    50_000_00 +
      150_000_00 -
      10_055_00 -
      1_500_00 +
      29_850_00 +
      20_000_00 -
      8_000_00,
  );
  check("usd savings (USD minor)", by(usd.id).balanceMinor, 1_000_00 - 100_00);
  check(
    "credit card (negative = owed)",
    by(card.id).balanceMinor,
    -2_500_00 + 1_500_00,
  );
  check("kamal receivable", by(kamalRecv.id).balanceMinor, 5_000_00 - 3_000_00);
  check("nimal payable", by(nimalPay.id).balanceMinor, -20_000_00 + 8_000_00);

  console.log("\n── invariants ──");
  const unbalanced = await db
    .select({
      id: postings.transactionId,
      baseSum: sql<number>`sum(${postings.baseAmountMinor})`.mapWith(Number),
    })
    .from(postings)
    .groupBy(postings.transactionId)
    .having(sql`sum(${postings.baseAmountMinor}) <> 0`);
  check("transactions not balancing in LKR", unbalanced.length, 0);

  const [orphans] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(postings)
    .where(
      sql`(${postings.accountId} is null) = (${postings.categoryId} is null)`,
    );
  check("postings with bad targets", orphans.n, 0);

  console.log("\n── reports ──");
  const totals = await getPeriodTotals("2026-09-01", "2026-09-30");
  check(
    "expense total (LKR minor)",
    totals.expense,
    4_500_00 + 55_00 + 2_500_00 + 150_00 + 120_00,
  );
  check("income total (LKR minor)", totals.income, 150_000_00 + 200_00);

  const [fx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.type, "exchange"));
  check("implied USD→LKR rate ×100", Math.round(Number(fx.fxRate) * 100), 300_00);

  const nw = await getNetWorth();
  console.log(`\nnet worth      ${formatMoney(nw.totalBase, "LKR")}`);
  console.log(`  LKR accounts ${formatMoney(nw.byCurrency.LKR, "LKR")}`);
  console.log(`  USD accounts ${formatMoney(nw.byCurrency.USD, "USD")}`);
  check(
    "net worth = LKR legs + USD @ 305",
    nw.totalBase,
    nw.byCurrency.LKR + 900_00 * 305,
  );

  console.log("");
  for (const p of await getPeopleOverview()) {
    console.log(
      `person ${p.person.name.padEnd(7)} owes me ${formatMoney(p.owedToYouBase, "LKR")}   |   I owe ${formatMoney(p.youOweBase, "LKR")}`,
    );
  }

  for (const c of await getCardsOverview()) {
    console.log(
      `card ${c.name}: owed ${formatMoney(-c.balanceMinor, c.currency)}, ` +
        `statement ${formatMoney(c.statementMinor, c.currency)}, ` +
        `due ${c.cycle.dueDate.toDateString()} (${c.cycle.daysUntilDue}d), ` +
        `util ${c.utilisation == null ? "–" : Math.round(c.utilisation * 100) + "%"}`,
    );
  }

  console.log(
    failures === 0
      ? "\n✓ all ledger checks passed"
      : `\n✗ ${failures} check(s) failed`,
  );
  if (failures) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
