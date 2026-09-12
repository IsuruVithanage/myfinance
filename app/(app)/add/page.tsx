import {
  getAccountsWithBalances,
  getCategories,
  getCounterparties,
  getFrequentCategories,
} from "@/lib/queries";
import Link from "next/link";
import { X } from "lucide-react";
import { PageHeader } from "@/components/ui";
import QuickAdd from "@/components/QuickAdd";

export const dynamic = "force-dynamic";

export default async function AddPage() {
  const [accounts, categories, people, frequentExpense, frequentIncome] =
    await Promise.all([
      getAccountsWithBalances(),
      getCategories(),
      getCounterparties(),
      getFrequentCategories("expense"),
      getFrequentCategories("income"),
    ]);

  return (
    <div>
      <PageHeader
        title="Add"
        action={
          <Link
            href="/"
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--surface-2)", color: "var(--ash)" }}
          >
            <X size={19} />
          </Link>
        }
      />
      <QuickAdd
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          color: a.color,
          balanceMinor: a.balanceMinor,
        }))}
        categories={categories
          .filter((c) => !c.archivedAt)
          .map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            color: c.color,
            isSystem: c.isSystem,
          }))}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        frequentExpense={frequentExpense}
        frequentIncome={frequentIncome}
      />
    </div>
  );
}
