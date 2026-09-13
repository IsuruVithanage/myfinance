import {
  getBudgetStatus,
  getCategories,
  getOverallBudgets,
} from "@/lib/queries";
import { BASE_CURRENCY } from "@/lib/money";
import { Money, PageHeader } from "@/components/ui";
import BudgetManager, { type BudgetRow } from "@/components/BudgetManager";
import OverallBudget from "@/components/OverallBudget";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const [categories, status, overall] = await Promise.all([
    getCategories("expense"),
    getBudgetStatus(),
    getOverallBudgets(),
  ]);

  const byId = new Map(status.map((s) => [s.id, s]));

  const rows: BudgetRow[] = categories
    .filter((c) => !c.archivedAt && !c.isSystem)
    .map((c) => {
      const s = byId.get(c.id);
      return {
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        kind: "expense" as const,
        budgetMinor: c.budgetMinor,
        period: c.budgetPeriod,
        spentMinor: s?.spentMinor ?? 0,
        pace: s?.pace ?? 0,
      };
    })
    // Budgeted categories first — they are what you came to check.
    .sort((a, b) =>
      a.budgetMinor === b.budgetMinor
        ? a.name.localeCompare(b.name)
        : b.budgetMinor - a.budgetMinor,
    );

  const categoryTotal = status.reduce((t, s) => t + s.budgetMinor, 0);

  return (
    <div>
      <PageHeader
        title="Budgets"
        subtitle="A limit on everything, and one per category if you want it."
      />

      <h2 className="eyebrow mb-2.5">Overall limit</h2>
      <OverallBudget
        rows={overall.map((o) => ({
          period: o.period,
          budgetMinor: o.budgetMinor,
          spentMinor: o.spentMinor,
          ratio: o.ratio,
          pace: o.pace,
        }))}
      />
      <p className="muted mt-2.5 px-1 text-[0.78rem]">
        Counts every expense, including categories with no budget of their own.
        Weeks run Monday to Sunday.
      </p>

      <div className="mb-2.5 mt-8 flex items-baseline justify-between">
        <h2 className="eyebrow">By category</h2>
        {categoryTotal > 0 && (
          <span className="muted text-[0.78rem]">
            <Money
              minor={categoryTotal}
              currency={BASE_CURRENCY}
              tone="muted"
              trimZeros
            />{" "}
            allocated
          </span>
        )}
      </div>
      <BudgetManager rows={rows} />

      <p className="muted mt-4 text-center text-xs">
        Leave an amount blank for no budget. You are warned at 80% and again
        when you go over.
      </p>
    </div>
  );
}
