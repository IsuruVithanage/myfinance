import Link from "next/link";
import { notFound } from "next/navigation";
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from "date-fns";
import {
  getCategory,
  getCategorySeries,
  getCategorySummary,
  getTransactions,
} from "@/lib/queries";
import { iso } from "@/lib/cards";
import { BASE_CURRENCY, formatMoney } from "@/lib/money";
import { iconFor } from "@/lib/icons";
import { budgetForRange, PERIOD_LABEL } from "@/lib/budget";
import { Change, IconTile, Meter, Money, PageHeader } from "@/components/ui";
import { CategoryBars } from "@/components/ReportCharts";
import TransactionList from "@/components/TransactionList";

export const dynamic = "force-dynamic";

/** Weeks run Monday to Sunday, matching the budget windows. */
const WEEK_OPTS = { weekStartsOn: 1 as const };

type RangeKey = "week" | "month" | "last" | "3m" | "year";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "3m", label: "3 months" },
  { key: "year", label: "This year" },
];

/**
 * Each range carries its own bucket size, so the chart always shows a readable
 * number of bars: days within a week or month, weeks across a quarter, months
 * across a year.
 */
function resolveRange(key: RangeKey) {
  const now = new Date();
  switch (key) {
    case "week":
      return {
        from: iso(startOfWeek(now, WEEK_OPTS)),
        to: iso(endOfWeek(now, WEEK_OPTS)),
        label: "This week",
        bucket: "day" as const,
      };
    case "last": {
      const m = subMonths(now, 1);
      return {
        from: iso(startOfMonth(m)),
        to: iso(endOfMonth(m)),
        label: format(m, "MMMM yyyy"),
        bucket: "day" as const,
      };
    }
    case "3m":
      return {
        from: iso(startOfMonth(subMonths(now, 2))),
        to: iso(endOfMonth(now)),
        label: "Last 3 months",
        bucket: "week" as const,
      };
    case "year":
      return {
        from: iso(startOfYear(now)),
        to: iso(endOfMonth(now)),
        label: format(now, "yyyy"),
        bucket: "month" as const,
      };
    default:
      return {
        from: iso(startOfMonth(now)),
        to: iso(endOfMonth(now)),
        label: format(now, "MMMM yyyy"),
        bucket: "day" as const,
      };
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isFinite(categoryId)) notFound();

  const category = await getCategory(categoryId);
  if (!category) notFound();

  const sp = await searchParams;
  const rangeKey = (RANGES.find((r) => r.key === sp.range)?.key ??
    "month") as RangeKey;
  const { from, to, label, bucket } = resolveRange(rangeKey);
  const kind = category.kind === "income" ? "income" : "expense";

  const [summary, series, txns] = await Promise.all([
    getCategorySummary(categoryId, from, to, kind),
    getCategorySeries(categoryId, from, to, bucket, kind),
    getTransactions({ categoryId, from, to, limit: 100 }),
  ]);

  const budget = budgetForRange(
    category.budgetMinor,
    category.budgetPeriod,
    from,
    to,
  );
  const over = budget > 0 && summary.totalBase > budget;

  // Average per bucket that actually saw activity — "per day you spent", not
  // an average diluted by every quiet day in the range.
  const active = series.filter((s) => s.total !== 0);
  const perActive = active.length
    ? Math.round(summary.totalBase / active.length)
    : 0;

  return (
    <div>
      <PageHeader
        title={category.name}
        subtitle={`${label} · in LKR`}
        action={
          <IconTile icon={iconFor(category.icon)} shape="circle" tone="pos" />
        }
      />

      {/* range pills */}
      <div className="hide-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-4">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/categories/${categoryId}?range=${r.key}`}
            className="chip"
            data-selected={rangeKey === r.key}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* ── headline ─────────────────────────────────────────────── */}
      <section className="panel px-5 py-5">
        <p className="eyebrow">{kind === "income" ? "Received" : "Spent"}</p>
        <Money
          minor={summary.totalBase}
          currency={BASE_CURRENCY}
          tone="plain"
          trimZeros
          className="mt-1.5 block text-[2.25rem] font-bold leading-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Change ratio={summary.change} invert={kind === "income"} />
          <span className="muted text-[0.8rem]">
            {summary.txnCount} transaction{summary.txnCount === 1 ? "" : "s"}
          </span>
          {perActive > 0 && (
            <span className="muted text-[0.8rem]">
              ·{" "}
              {formatMoney(perActive, BASE_CURRENCY, {
                compact: true,
                trimZeros: true,
              })}{" "}
              per active {bucket}
            </span>
          )}
        </div>

        {budget > 0 && (
          <div className="mt-4">
            <Meter
              value={summary.totalBase / budget}
              tone={
                over
                  ? "neg"
                  : summary.totalBase > budget * 0.8
                    ? "warn"
                    : "pos"
              }
            />
            <p className="muted mt-1.5 text-[0.72rem]">
              {PERIOD_LABEL[category.budgetPeriod]} budget, scaled to this
              range:{" "}
              <Money
                minor={budget}
                currency={BASE_CURRENCY}
                tone="muted"
                trimZeros
              />
              {over && (
                <span className="neg">
                  {" · over by "}
                  <Money
                    minor={summary.totalBase - budget}
                    currency={BASE_CURRENCY}
                    tone="neg"
                    trimZeros
                  />
                </span>
              )}
            </p>
          </div>
        )}
      </section>

      {/* ── shape over time ──────────────────────────────────────── */}
      <h2 className="eyebrow mb-2.5 mt-7">
        {bucket === "day"
          ? "Day by day"
          : bucket === "week"
            ? "Week by week"
            : "Month by month"}
      </h2>
      <div className="panel px-2 py-3">
        <CategoryBars data={series} bucket={bucket} tone={kind} />
      </div>

      {/* ── the transactions themselves ──────────────────────────── */}
      <h2 className="eyebrow mb-2.5 mt-7">Transactions</h2>
      <TransactionList transactions={txns} />
    </div>
  );
}
