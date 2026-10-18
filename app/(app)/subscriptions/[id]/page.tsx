import { notFound } from "next/navigation";
import { getAccountsWithBalances } from "@/lib/queries";
import { getSubscription } from "@/lib/subscriptions";
import { PageHeader } from "@/components/ui";
import SubscriptionForm from "@/components/SubscriptionForm";

export const dynamic = "force-dynamic";

export default async function EditSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sub, accounts] = await Promise.all([
    getSubscription(Number(id)),
    getAccountsWithBalances(),
  ]);
  if (!sub) notFound();

  return (
    <div>
      <PageHeader title={sub.name} subtitle="Edit subscription" />
      <SubscriptionForm
        initial={{
          id: sub.id,
          name: sub.name,
          amountMinor: sub.amountMinor,
          currency: sub.currency,
          cycle: sub.cycle,
          nextDate: sub.nextDate,
          autoRenew: sub.autoRenew,
          accountId: sub.accountId,
          note: sub.note,
        }}
        accounts={accounts
          .filter((a) => a.type !== "receivable" && a.type !== "payable")
          .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
      />
    </div>
  );
}
