import { getAccountsWithBalances } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import SubscriptionForm from "@/components/SubscriptionForm";

export const dynamic = "force-dynamic";

export default async function NewSubscriptionPage() {
  const accounts = await getAccountsWithBalances();
  return (
    <div>
      <PageHeader title="Add a subscription" subtitle="Anything you pay for on a schedule." />
      <SubscriptionForm
        accounts={accounts
          .filter((a) => a.type !== "receivable" && a.type !== "payable")
          .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
      />
    </div>
  );
}
