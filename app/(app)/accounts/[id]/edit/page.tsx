import { notFound } from "next/navigation";
import { getAccount } from "@/lib/queries";
import { accountUsage } from "@/lib/people";
import { fromMinor } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import AccountForm, { type AccountFormValues } from "@/components/AccountForm";

export const dynamic = "force-dynamic";

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getAccount(Number(id));
  if (!account) notFound();
  const usage = await accountUsage(account.id);
  if (account.type === "receivable" || account.type === "payable") notFound();

  const initial: AccountFormValues = {
    id: account.id,
    name: account.name,
    type: account.type as AccountFormValues["type"],
    currency: account.currency,
    openingBalance: String(fromMinor(account.openingBalanceMinor, account.currency)),
    institution: account.institution ?? "",
    last4: account.last4 ?? "",
    color: account.color,
    includeInNetWorth: account.includeInNetWorth,
    isActive: account.isActive,
    creditLimit: account.card
      ? String(fromMinor(account.card.creditLimitMinor, account.currency))
      : "",
    statementDay: String(account.card?.statementDay ?? 25),
    dueDay: String(account.card?.dueDay ?? 15),
    minPaymentPct: String(account.card?.minPaymentPct ?? 5),
    apr: String((account.card?.aprBp ?? 0) / 100),
    alertDaysBefore: String(account.card?.alertDaysBefore ?? 7),
  };

  return (
    <div>
      <PageHeader title="Edit account" subtitle={account.name} />
      <AccountForm initial={initial} postingCount={usage.postings} />
    </div>
  );
}
