"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setOverallBudget } from "@/lib/actions";
import { BASE_CURRENCY, formatMoney, toMinor } from "@/lib/money";
import { Meter, Money, Ring } from "@/components/ui";

export type OverallRow = {
  period: "weekly" | "monthly";
  budgetMinor: number;
  spentMinor: number;
  ratio: number;
  /** 0–1 through the period, so "spending fast" means ahead of the clock. */
  pace: number;
};

const LABEL = { weekly: "This week", monthly: "This month" } as const;

/**
 * A cap on everything you spend, regardless of category. Separate from the
 * per-category budgets below it: this one counts every expense, including
 * categories you never bothered to budget.
 */
export default function OverallBudget({ rows }: { rows: OverallRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingPeriod, setSavingPeriod] = useState<string | null>(null);
  const [, start] = useTransition();

  function persist(period: "weekly" | "monthly", amount: string) {
    setSavingPeriod(period);
    start(async () => {
      await setOverallBudget(period, toMinor(amount || "0", BASE_CURRENCY));
      setSavingPeriod(null);
      setDrafts((d) => {
        const next = { ...d };
        delete next[period];
        return next;
      });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const draft = drafts[row.period];
        const value =
          draft ??
          (row.budgetMinor
            ? formatMoney(row.budgetMinor, BASE_CURRENCY, {
                bare: true,
                trimZeros: true,
              })
            : "");

        const set = row.budgetMinor > 0;
        const overpacing = set && row.ratio > row.pace + 0.15;
        const tone = row.ratio >= 1 ? "neg" : overpacing ? "warn" : "pos";

        return (
          <section key={row.period} className="panel px-5 py-4">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{LABEL[row.period]}</p>
                <p className="num mt-1 text-[1.5rem] font-bold leading-none">
                  <Money
                    minor={row.spentMinor}
                    currency={BASE_CURRENCY}
                    tone={row.ratio >= 1 && set ? "neg" : "plain"}
                    trimZeros
                  />
                </p>
                <p className="muted mt-1 text-[0.78rem]">
                  {set ? (
                    <>
                      of{" "}
                      <Money
                        minor={row.budgetMinor}
                        currency={BASE_CURRENCY}
                        tone="muted"
                        trimZeros
                      />{" "}
                      spent in total
                    </>
                  ) : (
                    "spent in total · no limit set"
                  )}
                </p>
              </div>

              {set && (
                <Ring
                  value={row.ratio}
                  tone={row.ratio >= 1 ? "neg" : "pos"}
                  size={74}
                  thickness={7}
                >
                  <span className="num block text-[0.8rem] font-bold">
                    {Math.round(row.ratio * 100)}%
                  </span>
                  <span className="muted mt-0.5 block text-[0.55rem] font-semibold uppercase tracking-wider">
                    used
                  </span>
                </Ring>
              )}
            </div>

            {set && (
              <div className="mt-3">
                <Meter value={row.ratio} tone={tone} />
                <p className="muted mt-1.5 text-[0.75rem]">
                  {row.ratio >= 1 ? (
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
                      {overpacing && <span className="warn"> · spending fast</span>}
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="mt-3.5 flex items-center gap-2.5">
              <label
                className="muted shrink-0 text-[0.78rem]"
                htmlFor={`ob-${row.period}`}
              >
                Limit
              </label>
              <input
                id={`ob-${row.period}`}
                className="field num text-right"
                // .field sets width:100%, which beats a Tailwind width utility
                style={{ width: "7rem", flexShrink: 0 }}
                inputMode="decimal"
                placeholder="No limit"
                value={value}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [row.period]: e.target.value }))
                }
                onBlur={() => {
                  if (draft !== undefined) persist(row.period, draft);
                }}
              />
              {savingPeriod === row.period && (
                <Loader2 size={15} className="muted animate-spin" />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
