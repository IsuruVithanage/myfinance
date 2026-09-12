"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveCategory } from "@/lib/actions";
import { BASE_CURRENCY, formatMoney, toMinor } from "@/lib/money";
import { iconFor } from "@/lib/icons";
import { IconTile, Meter, Money } from "@/components/ui";
import type { BudgetPeriod } from "@/lib/db/schema";

export type BudgetRow = {
  id: number;
  name: string;
  icon: string;
  color: string;
  kind: "expense" | "income";
  budgetMinor: number;
  period: BudgetPeriod;
  /** Spent so far in this category's own current period. */
  spentMinor: number;
  /** 0–1 through the current period, for the on-pace read. */
  pace: number;
};

const PERIODS: Array<{ key: BudgetPeriod; short: string }> = [
  { key: "weekly", short: "Week" },
  { key: "monthly", short: "Month" },
];

export default function BudgetManager({ rows }: { rows: BudgetRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [, start] = useTransition();

  function persist(row: BudgetRow, amount: string, period: BudgetPeriod) {
    setSavingId(row.id);
    start(async () => {
      await saveCategory({
        id: row.id,
        name: row.name,
        kind: row.kind,
        icon: row.icon,
        color: row.color,
        budgetMinor: toMinor(amount || "0", BASE_CURRENCY),
        budgetPeriod: period,
      });
      setSavingId(null);
      setDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
      router.refresh();
    });
  }

  return (
    <ul className="panel">
      {rows.map((row) => {
        const draft = drafts[row.id];
        const value =
          draft ??
          (row.budgetMinor
            ? formatMoney(row.budgetMinor, BASE_CURRENCY, {
                bare: true,
                trimZeros: true,
              })
            : "");

        const ratio = row.budgetMinor > 0 ? row.spentMinor / row.budgetMinor : 0;
        // Ahead of the clock is the thing worth flagging, not the raw percentage.
        const overpacing = row.budgetMinor > 0 && ratio > row.pace + 0.15;
        const tone = ratio >= 1 ? "neg" : overpacing ? "warn" : "pos";

        return (
          <li key={row.id} className="hairline px-4 py-3.5">
            <div className="flex items-center gap-3">
              <IconTile icon={iconFor(row.icon)} shape="circle" tone="pos" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.95rem] font-medium leading-tight">
                  {row.name}
                </p>
                {row.budgetMinor > 0 && (
                  <p className="muted mt-0.5 truncate text-[0.78rem]">
                    <Money
                      minor={row.spentMinor}
                      currency={BASE_CURRENCY}
                      tone="muted"
                      trimZeros
                    />{" "}
                    of{" "}
                    <Money
                      minor={row.budgetMinor}
                      currency={BASE_CURRENCY}
                      tone="muted"
                      trimZeros
                    />{" "}
                    {row.period === "weekly" ? "this week" : "this month"}
                  </p>
                )}
              </div>

              <input
                className="field num text-right"
                // .field sets width:100%, which beats a Tailwind width utility
                style={{ width: "5.5rem", flexShrink: 0 }}
                inputMode="decimal"
                placeholder="—"
                aria-label={`${row.name} budget amount`}
                value={value}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                }
                onBlur={() => {
                  if (draft !== undefined) persist(row, draft, row.period);
                }}
              />

              {savingId === row.id && (
                <Loader2 size={15} className="muted animate-spin" />
              )}
            </div>

            <div className="mt-2.5 flex items-center gap-3">
              <div className="flex gap-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    aria-pressed={row.period === p.key}
                    className="chip !px-2.5 !py-1 text-[0.72rem]"
                    onClick={() => persist(row, value, p.key)}
                  >
                    {p.short}
                  </button>
                ))}
              </div>

              {row.budgetMinor > 0 && (
                <div className="min-w-0 flex-1">
                  <Meter value={ratio} tone={tone} />
                  <p className="muted mt-1 text-[0.72rem]">
                    {ratio >= 1 ? (
                      <span className="neg">
                        Over by{" "}
                        <Money
                          minor={row.spentMinor - row.budgetMinor}
                          currency={BASE_CURRENCY}
                          tone="neg"
                          trimZeros
                        />
                      </span>
                    ) : (
                      <>
                        <Money
                          minor={row.budgetMinor - row.spentMinor}
                          currency={BASE_CURRENCY}
                          tone="muted"
                          trimZeros
                        />{" "}
                        left
                        {overpacing && (
                          <span className="warn"> · spending fast</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
