import { PageHeader } from "@/components/ui";
import AccountForm, { emptyAccount } from "@/components/AccountForm";

export default function NewAccountPage() {
  return (
    <div>
      <PageHeader title="New account" subtitle="Wallet, bank, card or savings." />
      <AccountForm initial={emptyAccount} />
    </div>
  );
}
