import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  getAccountsWithBalances,
  getCategories,
  getTransaction,
} from "@/lib/queries";
import { summarise, TYPE_LABEL, type TxnLike } from "@/lib/txn-display";
import { Money, PageHeader, Pill } from "@/components/ui";
import DeleteTransaction from "@/components/DeleteTransaction";
import EditTransaction from "@/components/EditTransaction";

export const dynamic = "force-dynamic";

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const txn = await getTransaction(Number(id));
  if (!txn) notFound();

  const s = summarise(txn as unknown as TxnLike);

  const [allAccounts, allCategories] = await Promise.all([
    getAccountsWithBalances(),
    getCategories(txn.type === "income" ? "income" : "expense"),
  ]);

  const accountLeg = txn.legs.find((l) => l.posting.accountId != null);
  const categoryLeg = txn.legs.find((l) => l.posting.categoryId != null);

  return (
    <div>
      <PageHeader
        title={s.title}
        subtitle={format(parseISO(txn.date), "EEEE, d MMMM yyyy")}
      />

      <div className="px-1 py-6 text-center">
        <Pill tone="neutral">{TYPE_LABEL[txn.type]}</Pill>
        <Money
          minor={s.amountMinor}
          currency={s.currency}
          signed={s.amountMinor > 0}
          className="mt-3 block text-[2.25rem] font-bold leading-none"
        />
        {s.secondary && <p className="muted num mt-1">{s.secondary}</p>}
        {txn.fxRate && (
          <p className="muted num mt-1 text-xs">
            at {Number(txn.fxRate).toFixed(2)} LKR per USD
          </p>
        )}
      </div>

      {txn.note && (
        <div className="panel mt-3 px-4 py-3">
          <p className="muted text-xs font-semibold uppercase">Note</p>
          <p className="mt-0.5 text-sm">{txn.note}</p>
        </div>
      )}

      {/* the double-entry view — where the money actually came from and went */}
      <h2 className="eyebrow mb-2.5 mt-8">Where it moved</h2>
      <ul className="panel">
        {txn.legs.map((l) => (
          <li
            key={l.posting.id}
            className="hairline flex items-center justify-between gap-3 px-4 py-3"
           
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {l.posting.accountId ? (
                  <Link href={`/accounts/${l.posting.accountId}`}>
                    {l.accountName}
                  </Link>
                ) : (
                  (l.categoryName ?? "—")
                )}
              </p>
              <p className="muted text-xs">
                {l.posting.accountId
                  ? "Account"
                  : l.categoryKind === "income"
                    ? "Income category"
                    : "Expense category"}
                {l.posting.memo && ` · ${l.posting.memo}`}
              </p>
            </div>
            <Money
              minor={l.posting.amountMinor}
              currency={l.posting.currency}
              signed
              className="shrink-0 text-sm font-semibold"
            />
          </li>
        ))}
      </ul>
      <p className="muted mt-2 text-center text-xs">
        These always add up to zero — that is what keeps every balance honest.
      </p>

      <div className="mt-6 space-y-2">
        <EditTransaction
          id={txn.id}
          type={txn.type}
          date={txn.date}
          description={txn.description}
          note={txn.note}
          amountMinor={s.amountMinor}
          currency={s.currency}
          accountId={accountLeg?.posting.accountId ?? null}
          categoryId={categoryLeg?.posting.categoryId ?? null}
          accounts={allAccounts
            .filter((a) => !["receivable", "payable"].includes(a.type))
            .map((a) => ({ id: a.id, name: a.name }))}
          categories={allCategories
            .filter((c) => !c.archivedAt)
            .map((c) => ({ id: c.id, name: c.name }))}
        />
        <DeleteTransaction id={txn.id} />
      </div>
    </div>
  );
}
