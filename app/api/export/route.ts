import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { db } from "@/lib/db";
import {
  accounts,
  cardDetails,
  categories,
  counterparties,
  fxRates,
  postings,
  settings,
  transactions,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Escape a value for CSV: quote it and double any internal quotes. */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(process.env.AUTH_SECRET, token))) {
    return NextResponse.json({ error: "Locked." }, { status: 401 });
  }

  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const rows = await db
      .select({
        txnId: transactions.id,
        date: transactions.date,
        type: transactions.type,
        description: transactions.description,
        note: transactions.note,
        account: accounts.name,
        category: categories.name,
        amountMinor: postings.amountMinor,
        currency: postings.currency,
        baseAmountMinor: postings.baseAmountMinor,
        memo: postings.memo,
      })
      .from(postings)
      .innerJoin(transactions, eq(transactions.id, postings.transactionId))
      .leftJoin(accounts, eq(accounts.id, postings.accountId))
      .leftJoin(categories, eq(categories.id, postings.categoryId))
      .orderBy(transactions.date, transactions.id);

    const header = [
      "transaction_id",
      "date",
      "type",
      "description",
      "note",
      "account",
      "category",
      "amount",
      "currency",
      "amount_lkr",
      "memo",
    ];

    const body = rows.map((r) =>
      [
        r.txnId,
        r.date,
        r.type,
        r.description,
        r.note,
        r.account,
        r.category,
        (r.amountMinor / 100).toFixed(2),
        r.currency,
        (r.baseAmountMinor / 100).toFixed(2),
        r.memo,
      ]
        .map(csvCell)
        .join(","),
    );

    return new NextResponse([header.join(","), ...body].join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="myfinance-${stamp}.csv"`,
      },
    });
  }

  const [
    settingsRows,
    accountRows,
    cardRows,
    categoryRows,
    counterpartyRows,
    transactionRows,
    postingRows,
    rateRows,
  ] = await Promise.all([
    db.select().from(settings),
    db.select().from(accounts),
    db.select().from(cardDetails),
    db.select().from(categories),
    db.select().from(counterparties),
    db.select().from(transactions),
    db.select().from(postings),
    db.select().from(fxRates),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    settings: settingsRows,
    accounts: accountRows,
    cardDetails: cardRows,
    categories: categoryRows,
    counterparties: counterpartyRows,
    transactions: transactionRows,
    postings: postingRows,
    fxRates: rateRows,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="myfinance-${stamp}.json"`,
    },
  });
}
