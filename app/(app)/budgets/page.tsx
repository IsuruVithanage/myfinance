import { getBudgetStatus, getCategories } from "@/lib/queries";
import { currentPeriod } from "@/lib/budget";
import { BASE_CURRENCY } from "@/lib/money";
import { Money, PageHeader, Ring } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import BudgetManager, { type BudgetRow } from "@/components/BudgetManager";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const [categories, status] = await Promise.all([
    getCategories("expense"),
    getBudgetStatus(),
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

  const weekly = status.filter((s) => s.period === "weekly");
  const monthly = status.filter((s) => s.period === "monthly");

  const sum = (list: typeof status, key: "budgetMinor" | "spentMinor") =>
    list.reduce((t, s) => t + s[key], 0);

  const groups = [
    { label: "This week", list: weekly, window: currentPeriod("weekly") },
    { label: "This month", list: monthly, window: currentPeriod("monthly") },
  ].filter((g) => g.list.length > 0);

  return (
    <div>
      <PageHeader
        title="Budgets"
        subtitle="Set an amount per category, weekly or monthly."
      />

      {groups.length > 0 && (
        <div className="mb-6 grid gap-3">
          {groups.map((g) => {
            const budget = sum(g.list, "budgetMinor");
            const spent = sum(g.list, "spentMinor");
            const ratio = budget > 0 ? spent / budget : 0;
            return (
              <section
                key={g.label}
                className="panel flex items-center gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">{g.label}</p>
                  <p className="num mt-1 text-[1.4rem] font-bold leading-none">
                    <Money
                      minor={spent}
                      currency={BASE_CURRENCY}
                      tone={ratio >= 1 ? "neg" : "plain"}
                      trimZeros
                    />
                  </p>
                  <p className="muted mt-1 text-[0.78rem]">
                    of{" "}
                    <Money
                      minor={budget}
                      currency={BASE_CURRENCY}
                      tone="muted"
                      trimZeros
                    />{" "}
                    across {g.list.length}{" "}
                    {g.list.length === 1 ? "category" : "categories"}
                  </p>
                </div>

                <Ring
                  value={ratio}
                  tone={ratio >= 1 ? "neg" : "pos"}
                  size={74}
                  thickness={7}
                >
                  <span className="num block text-[0.8rem] font-bold">
                    {Math.round(ratio * 100)}%
                  </span>
                  <span className="muted mt-0.5 block text-[0.55rem] font-semibold uppercase tracking-wider">
                    used
                  </span>
                </Ring>
              </section>
            );
          })}
        </div>
      )}

      <h2 className="eyebrow mb-2.5">All spending categories</h2>
      <BudgetManager rows={rows} />

      <p className="muted mt-4 text-center text-xs">
        Leave an amount blank for no budget. You are warned at 80% and again when
        you go over — weekly budgets reset every Monday.
      </p>

      {status.length === 0 && (
        <p className="muted mt-2 text-center text-xs">
          Nothing budgeted yet. Try{" "}
          {formatMoney(2500000, BASE_CURRENCY, { trimZeros: true })} a month on
          Groceries to start.
        </p>
      )}
    </div>
  );
}
