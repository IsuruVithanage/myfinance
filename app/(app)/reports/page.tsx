import Link from "next/link";
import {
  endOfMonth,
  format,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import {
  getCategoryBreakdown,
  getDailySeries,
  getMonthlyTrend,
  getPeriodTotals,
} from "@/lib/queries";
import { iso } from "@/lib/cards";
import { BASE_CURRENCY, formatMoney } from "@/lib/money";
import { iconFor } from "@/lib/icons";
import {
  Change,
  IconTile,
  Legend,
  Meter,
  Money,
  PageHeader,
  Ring,
} from "@/components/ui";
import { CategoryDonut, FlowArea, TrendChart } from "@/components/ReportCharts";
import { ramp } from "@/lib/chart-colors";

export const dynamic = "force-dynamic";

type RangeKey = "month" | "last" | "3m" | "year";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "month", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "3m", label: "3 months" },
  { key: "year", label: "This year" },
];

function resolveRange(key: RangeKey) {
  const now = new Date();
  switch (key) {
    case "last": {
      const m = subMonths(now, 1);
      return {
        from: iso(startOfMonth(m)),
        to: iso(endOfMonth(m)),
        label: format(m, "MMMM yyyy"),
        months: 1,
      };
    }
    case "3m":
      return {
        from: iso(startOfMonth(subMonths(now, 2))),
        to: iso(endOfMonth(now)),
        label: "Last 3 months",
        months: 3,
      };
    case "year":
      return {
        from: iso(startOfYear(now)),
        to: iso(endOfMonth(now)),
        label: format(now, "yyyy"),
        months: now.getMonth() + 1,
      };
    default:
      return {
        from: iso(startOfMonth(now)),
        to: iso(endOfMonth(now)),
        label: format(now, "MMMM yyyy"),
        months: 1,
      };
  }
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; kind?: string }>;
}) {
  const sp = await searchParams;
  const rangeKey = (RANGES.find((r) => r.key === sp.range)?.key ??
    "month") as RangeKey;
  const kind = sp.kind === "income" ? "income" : "expense";
  const { from, to, label, months } = resolveRange(rangeKey);

  const [totals, breakdown, trend, daily] = await Promise.all([
    getPeriodTotals(from, to),
    getCategoryBreakdown(from, to, kind),
    getMonthlyTrend(6),
    getDailySeries(from, to),
  ]);

  const total = breakdown.reduce((s, b) => s + b.totalBase, 0);
  const savedRatio = totals.income > 0 ? totals.net / totals.income : 0;

  // Legend mirrors the donut exactly — same order, same ramp.
  const legendItems = breakdown.slice(0, 7).map((b, i) => ({
    label: b.name,
    color: ramp(kind, i, Math.min(breakdown.length, 8)),
    value: formatMoney(b.totalBase, BASE_CURRENCY, {
      compact: true,
      bare: true,
      trimZeros: true,
    }),
  }));

  return (
    <div>
      <PageHeader title="Reports" subtitle={`${label} · in LKR`} />

      {/* period pills */}
      <div className="hide-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-4">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/reports?range=${r.key}&kind=${kind}`}
            className="chip"
            data-selected={rangeKey === r.key}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* ── headline: in, out, and how much stuck ─────────────────── */}
      <section className="panel flex items-center gap-5 px-5 py-5">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="eyebrow">In</p>
            <Money
              minor={totals.income}
              currency={BASE_CURRENCY}
              tone="pos"
              compact
              trimZeros
              className="block text-xl font-bold"
            />
          </div>
          <div>
            <p className="eyebrow">Out</p>
            <Money
              minor={totals.expense}
              currency={BASE_CURRENCY}
              tone="neg"
              compact
              trimZeros
              className="block text-xl font-bold"
            />
          </div>
        </div>

        <Ring
          value={Math.max(0, savedRatio)}
          tone={totals.net < 0 ? "neg" : "pos"}
          size={104}
          thickness={9}
        >
          <span className="num block px-1 text-[0.95rem] font-bold">
            {formatMoney(Math.abs(totals.net), BASE_CURRENCY, {
              compact: true,
              bare: true,
              trimZeros: true,
            })}
          </span>
          <span className="muted mt-0.5 block text-[0.55rem] font-semibold uppercase tracking-wider">
            {totals.net < 0 ? "Overspent" : "Kept"}
          </span>
        </Ring>
      </section>

      {/* ── daily flow ───────────────────────────────────────────── */}
      <h2 className="eyebrow mb-2.5 mt-7">Spending, day by day</h2>
      <div className="panel px-2 py-3">
        <FlowArea data={daily} />
      </div>

      {/* ── category split ───────────────────────────────────────── */}
      <div className="mb-2.5 mt-7 flex items-center justify-between">
        <h2 className="eyebrow">By category</h2>
        <div className="flex gap-1">
          {(["expense", "income"] as const).map((k) => (
            <Link
              key={k}
              href={`/reports?range=${rangeKey}&kind=${k}`}
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                background: kind === k ? "var(--surface-2)" : "transparent",
                color: kind === k ? "var(--green)" : "var(--ash-dim)",
              }}
            >
              {k === "expense" ? "Spending" : "Income"}
            </Link>
          ))}
        </div>
      </div>

      <div className="panel px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-[1.1]">
            <CategoryDonut
              data={breakdown}
              tone={kind}
              centreValue={formatMoney(total, BASE_CURRENCY, {
                compact: true,
                bare: true,
                trimZeros: true,
              })}
              centreLabel="Total"
            />
          </div>
          <div className="min-w-0 flex-1">
            <Legend items={legendItems} />
          </div>
        </div>
      </div>

      {/* ── the detail, with a trend on every row ────────────────── */}
      <ul className="panel mt-3">
        {breakdown.length === 0 && (
          <li className="muted px-4 py-8 text-center text-sm">
            Nothing in this period.
          </li>
        )}
        {breakdown.map((b) => {
          const share = total > 0 ? b.totalBase / total : 0;
          const budget = b.budgetMinor * months;
          return (
            <li key={b.categoryId} className="hairline px-4 py-3.5">
              <div className="flex items-center gap-3">
                <IconTile icon={iconFor(b.icon)} shape="circle" tone="pos" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-medium leading-tight">
                    {b.name}
                  </p>
                  <p className="muted mt-0.5 text-[0.78rem]">
                    {Math.round(share * 100)}% · {b.txnCount} txn
                    {b.txnCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Money
                    minor={b.totalBase}
                    currency={BASE_CURRENCY}
                    tone="plain"
                    trimZeros
                    className="text-[0.95rem] font-semibold"
                  />
                  <div className="mt-0.5">
                    <Change ratio={b.change} invert={kind === "income"} />
                  </div>
                </div>
              </div>

              {kind === "expense" && budget > 0 && (
                <div className="mt-2.5">
                  <Meter
                    value={b.totalBase / budget}
                    tone={
                      b.totalBase > budget
                        ? "neg"
                        : b.totalBase > budget * 0.8
                          ? "warn"
                          : "pos"
                    }
                  />
                  <p className="muted mt-1.5 text-[0.72rem]">
                    Budget{" "}
                    <Money
                      minor={budget}
                      currency={BASE_CURRENCY}
                      tone="muted"
                      trimZeros
                    />
                    {b.totalBase > budget && (
                      <span className="neg">
                        {" · over by "}
                        <Money
                          minor={b.totalBase - budget}
                          currency={BASE_CURRENCY}
                          tone="neg"
                          trimZeros
                        />
                      </span>
                    )}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* ── longer arc ───────────────────────────────────────────── */}
      <h2 className="eyebrow mb-2.5 mt-7">Last 6 months</h2>
      <div className="panel px-2 py-3">
        <TrendChart data={trend} />
      </div>
    </div>
  );
}
