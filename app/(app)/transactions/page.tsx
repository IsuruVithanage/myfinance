import { getTransactions } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import SearchField from "@/components/SearchField";
import TransactionList from "@/components/TransactionList";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page, q } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const perPage = 60;

  const transactions = await getTransactions({
    limit: perPage,
    offset: (pageNum - 1) * perPage,
    q,
  });

  const query = q?.trim() ?? "";

  return (
    <div>
      <PageHeader title="Activity" />

      <div className="mb-5">
        <SearchField
          defaultValue={query}
          basePath="/transactions"
          placeholder="Search notes, categories, people"
        />
      </div>

      <TransactionList
        transactions={transactions}
        emptyMessage={
          query
            ? `Nothing matches “${query}”.`
            : "Nothing recorded yet — tap + to add one."
        }
      />

      {!query && (
        <div className="mt-6 flex justify-between">
          {pageNum > 1 ? (
            <a href={`/transactions?page=${pageNum - 1}`} className="btn btn-ghost">
              Newer
            </a>
          ) : (
            <span />
          )}
          {transactions.length === perPage && (
            <a href={`/transactions?page=${pageNum + 1}`} className="btn btn-ghost">
              Older
            </a>
          )}
        </div>
      )}
    </div>
  );
}
