"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BASE_CURRENCY, formatMoney } from "@/lib/money";
import { ramp } from "@/lib/chart-colors";

type Slice = { name: string; totalBase: number };
type MonthPoint = { month: string; income: number; expense: number };
type DayPoint = { date: string; income: number; expense: number };

const axisStyle = { fontSize: 11, fill: "var(--ash-dim)" };

/** Abbreviate minor units to something that fits on a phone axis. */
function tickMoney(v: number) {
  const rupees = v / 100;
  if (Math.abs(rupees) >= 1_000_000)
    return `${Math.round(rupees / 100_000) / 10}M`;
  if (Math.abs(rupees) >= 1_000) return `${Math.round(rupees / 1_000)}k`;
  return String(Math.round(rupees));
}

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { name?: string } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs"
      style={{ background: "var(--surface-2)", color: "var(--ink)" }}
    >
      <p className="font-semibold">{label ?? payload[0].payload?.name ?? ""}</p>
      {payload.map((p, i) => (
        <p key={i} className="num muted">
          {p.name ? `${p.name}: ` : ""}
          {formatMoney(Number(p.value ?? 0), BASE_CURRENCY, { trimZeros: true })}
        </p>
      ))}
    </div>
  );
}

/* ───────────────────────── daily flow ──────────────────────────── */

/**
 * Day-by-day spending. Income is deliberately not plotted here: salary lands
 * as one or two spikes a month, and on a shared linear axis it flattens the
 * spending line into a straight edge. Income vs spending lives in the monthly
 * bars instead, where both are the same order of magnitude.
 */
export function FlowArea({ data }: { data: DayPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="muted py-10 text-center text-sm">
        Nothing recorded in this period.
      </p>
    );
  }

  const rows = data.map((d) => ({
    ...d,
    label: `${d.date.slice(8)}/${d.date.slice(5, 7)}`,
  }));

  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--red)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--red)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--line)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={tickMoney}
            width={46}
          />
          <Tooltip content={<TooltipBox />} />
          <Area
            type="monotone"
            dataKey="expense"
            name="Spent"
            stroke="var(--red)"
            strokeWidth={2.2}
            fill="url(#outFill)"
            dot={false}
            activeDot={{ r: 4, fill: "var(--red)", stroke: "var(--black)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────────────────── category donut ──────────────────────── */

export function CategoryDonut({
  data,
  tone = "expense",
  centreValue,
  centreLabel,
}: {
  data: Slice[];
  tone?: "expense" | "income";
  centreValue?: string;
  centreLabel?: string;
}) {
  const top = data.slice(0, 7);
  const rest = data.slice(7);
  const slices = rest.length
    ? [
        ...top,
        {
          name: "Everything else",
          totalBase: rest.reduce((s, r) => s + r.totalBase, 0),
        },
      ]
    : top;

  if (slices.length === 0) {
    return (
      <p className="muted py-10 text-center text-sm">Nothing in this period.</p>
    );
  }

  return (
    <div className="relative" style={{ width: "100%", height: 190 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={slices}
            dataKey="totalBase"
            nameKey="name"
            innerRadius="66%"
            outerRadius="94%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {slices.map((s, i) => (
              <Cell key={s.name} fill={ramp(tone, i, slices.length)} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox />} />
        </PieChart>
      </ResponsiveContainer>

      {/* the total belongs in the hole, not in a caption below the chart */}
      {centreValue && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="num text-[1.15rem] font-bold leading-none">
              {centreValue}
            </p>
            {centreLabel && (
              <p className="muted mt-1 text-[0.65rem] font-semibold uppercase tracking-wider">
                {centreLabel}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── period bars ─────────────────────────── */

export function TrendChart({ data }: { data: MonthPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="muted py-10 text-center text-sm">
        Not enough history yet — come back after a few weeks.
      </p>
    );
  }

  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const rows = data.map((d) => ({
    ...d,
    label: MONTHS[Number(d.month.slice(5, 7)) - 1] ?? d.month,
  }));

  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            vertical={false}
            stroke="var(--line)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={tickMoney}
            width={46}
          />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "transparent" }} />
          <Bar
            dataKey="income"
            name="In"
            fill="var(--green)"
            radius={[5, 5, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expense"
            name="Out"
            fill="var(--red)"
            radius={[5, 5, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
