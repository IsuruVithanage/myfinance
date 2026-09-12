import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getAccount, getTransactions } from "@/lib/queries";
import { Money, PageHeader } from "@/components/ui";
import TransactionList from "@/components/TransactionList";
import Reconcile from "@/components/Reconcile";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const accountId = Number(id);
  const account = await getAccount(accountId);
  if (!account) notFound();

  const transactions = await getTransactions({ accountId, limit: 100 });

  return (
    <div>
      <PageHeader
        title={account.name}
        subtitle={[account.institution, account.last4 && `••${account.last4}`, account.currency]
          .filter(Boolean)
          .join(" · ")}
        action={
          account.type === "receivable" || account.type === "payable" ? undefined : (
            <Link
              href={`/accounts/${account.id}/edit`}
              aria-label="Edit account"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ background: "var(--surface-2)", color: "var(--ash)" }}
            >
              <Pencil size={17} />
            </Link>
          )
        }
      />

      <div className="px-1 py-4">
        <p className="eyebrow">
          {account.type === "credit_card" || account.type === "payable"
            ? "Currently owed"
            : "Balance"}
        </p>
        <Money
          minor={
            account.type === "credit_card" || account.type === "payable"
              ? -account.balanceMinor
              : account.balanceMinor
          }
          currency={account.currency}
          tone={account.type === "credit_card" || account.type === "payable" ? "neg" : "plain"}
          className="mt-1.5 block text-[2.25rem] font-bold leading-none"
        />
        {account.openingBalanceMinor !== 0 && (
          <p className="muted mt-2 text-xs">
            Opening balance{" "}
            <Money
              minor={account.openingBalanceMinor}
              currency={account.currency}
              tone="plain"
            />
          </p>
        )}
      </div>

      {account.type !== "receivable" && account.type !== "payable" && (
        <div className="mt-4">
          <Reconcile
            accountId={account.id}
            currency={account.currency}
            currentMinor={account.balanceMinor}
          />
        </div>
      )}

      <h2 className="eyebrow mb-2.5 mt-8">Transactions</h2>
      <TransactionList
        transactions={transactions}
        emptyMessage="Nothing has moved through this account yet."
      />
    </div>
  );
}
