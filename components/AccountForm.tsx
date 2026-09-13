"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { removeAccount, saveAccount, setAccountActive } from "@/lib/actions";
import { toMinor } from "@/lib/money";
import type { Currency } from "@/lib/db/schema";

type AccountType =
  | "cash"
  | "bank"
  | "savings"
  | "credit_card"
  | "wallet"
  | "investment";

const TYPES: Array<{ key: AccountType; label: string; hint: string }> = [
  { key: "cash", label: "Cash", hint: "Money in your wallet" },
  { key: "bank", label: "Bank", hint: "Current account" },
  { key: "savings", label: "Savings", hint: "Savings / fixed deposit" },
  { key: "credit_card", label: "Credit card", hint: "You owe the bank" },
  { key: "wallet", label: "Digital wallet", hint: "eZ Cash, FriMi, PayPal" },
  { key: "investment", label: "Investment", hint: "Shares, unit trusts" },
];

export type AccountFormValues = {
  id?: number;
  name: string;
  type: AccountType;
  currency: Currency;
  openingBalance: string;
  institution: string;
  last4: string;
  color: string;
  includeInNetWorth: boolean;
  isActive?: boolean;
  creditLimit: string;
  statementDay: string;
  dueDay: string;
  minPaymentPct: string;
  apr: string;
  alertDaysBefore: string;
};

export const emptyAccount: AccountFormValues = {
  name: "",
  type: "bank",
  currency: "LKR",
  openingBalance: "",
  institution: "",
  last4: "",
  color: "#21db9a",
  includeInNetWorth: true,
  creditLimit: "",
  statementDay: "25",
  dueDay: "15",
  minPaymentPct: "5",
  apr: "24",
  alertDaysBefore: "7",
};

export default function AccountForm({
  initial,
  /** Existing accounts can't change currency once they hold transactions. */
  lockCurrency = false,
  /** How many postings have touched it — deletion is only safe at zero. */
  postingCount = 0,
}: {
  initial: AccountFormValues;
  lockCurrency?: boolean;
  postingCount?: number;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof AccountFormValues>(
    k: K,
    value: AccountFormValues[K],
  ) => setV((prev) => ({ ...prev, [k]: value }));

  const isCard = v.type === "credit_card";

  function submit() {
    setError(null);
    start(async () => {
      const result = await saveAccount({
        id: v.id,
        name: v.name.trim(),
        type: v.type,
        currency: v.currency,
        openingBalanceMinor: toMinor(v.openingBalance || "0", v.currency),
        institution: v.institution.trim() || null,
        last4: v.last4.trim() || null,
        color: v.color,
        icon: "wallet",
        includeInNetWorth: v.includeInNetWorth,
        card: isCard
          ? {
              creditLimitMinor: toMinor(v.creditLimit || "0", v.currency),
              statementDay: Number(v.statementDay) || 1,
              dueDay: Number(v.dueDay) || 1,
              dueMonthOffset: 1,
              minPaymentPct: Number(v.minPaymentPct) || 0,
              aprBp: Math.round((Number(v.apr) || 0) * 100),
              alertDaysBefore: Number(v.alertDaysBefore) || 7,
            }
          : null,
      });

      if (result.ok) {
        router.push(v.id ? `/accounts/${v.id}` : "/accounts");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="panel space-y-3 px-4 py-4">
        <div>
          <label className="label" htmlFor="acc-name">
            Name
          </label>
          <input
            id="acc-name"
            className="field"
            placeholder="Sampath Current"
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>

        <div>
          <p className="label">Type</p>
          <div className="grid grid-cols-2 gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => set("type", t.key)}
                className="rounded-xl px-3 py-2.5 text-left"
                style={{
                  background: v.type === t.key ? "var(--green)" : "var(--surface-2)",
                }}
              >
                <span
                  className="block text-sm font-semibold"
                  style={{ color: v.type === t.key ? "#000" : "var(--ink)" }}
                >
                  {t.label}
                </span>
                <span
                  className="block text-[0.7rem]"
                  style={{ color: v.type === t.key ? "rgb(0 0 0 / .6)" : "var(--ash)" }}
                >
                  {t.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label">Currency</p>
          <div className="flex gap-1.5">
            {(["LKR", "USD"] as const).map((c) => (
              <button
                key={c}
                disabled={lockCurrency}
                onClick={() => set("currency", c)}
                className="btn flex-1"
                style={{
                  background: v.currency === c ? "var(--green)" : "var(--surface-2)",
                  color: v.currency === c ? "#000" : "var(--ash)",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          {lockCurrency && (
            <p className="muted mt-1 text-xs">
              Currency is fixed once an account has transactions.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="acc-open">
            {isCard ? "Amount currently owed" : "Balance right now"}
          </label>
          <input
            id="acc-open"
            className="field num"
            inputMode="decimal"
            placeholder="0.00"
            value={v.openingBalance}
            onChange={(e) => set("openingBalance", e.target.value)}
          />
          <p className="muted mt-1 text-xs">
            {isCard
              ? "Enter what you owe as a negative number, e.g. −45000."
              : "Your starting point. Transactions you add move it from here."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="acc-inst">
              Bank (optional)
            </label>
            <input
              id="acc-inst"
              className="field"
              placeholder="Sampath"
              value={v.institution}
              onChange={(e) => set("institution", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="acc-last4">
              Last 4 digits
            </label>
            <input
              id="acc-last4"
              className="field num"
              inputMode="numeric"
              maxLength={4}
              placeholder="4321"
              value={v.last4}
              onChange={(e) => set("last4", e.target.value)}
            />
          </div>
        </div>
      </div>

      {isCard && (
        <div className="panel space-y-3 px-4 py-4">
          <h2 className="font-semibold">Card details</h2>
          <div>
            <label className="label" htmlFor="acc-limit">
              Credit limit
            </label>
            <input
              id="acc-limit"
              className="field num"
              inputMode="decimal"
              placeholder="200000"
              value={v.creditLimit}
              onChange={(e) => set("creditLimit", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="acc-stmt">
                Statement closes on
              </label>
              <input
                id="acc-stmt"
                className="field num"
                inputMode="numeric"
                value={v.statementDay}
                onChange={(e) => set("statementDay", e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="acc-due">
                Payment due on
              </label>
              <input
                id="acc-due"
                className="field num"
                inputMode="numeric"
                value={v.dueDay}
                onChange={(e) => set("dueDay", e.target.value)}
              />
            </div>
          </div>
          <p className="muted text-xs">
            Day of the month. A statement closing on the {v.statementDay || "25"}
            th is due on the {v.dueDay || "15"}th of the next month.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label" htmlFor="acc-min">
                Min %
              </label>
              <input
                id="acc-min"
                className="field num"
                inputMode="decimal"
                value={v.minPaymentPct}
                onChange={(e) => set("minPaymentPct", e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="acc-apr">
                APR %
              </label>
              <input
                id="acc-apr"
                className="field num"
                inputMode="decimal"
                value={v.apr}
                onChange={(e) => set("apr", e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="acc-alert">
                Warn (days)
              </label>
              <input
                id="acc-alert"
                className="field num"
                inputMode="numeric"
                value={v.alertDaysBefore}
                onChange={(e) => set("alertDaysBefore", e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <label className="panel flex items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className="block text-sm font-semibold">Count in net worth</span>
          <span className="muted block text-xs">
            Turn off for accounts you only track.
          </span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={v.includeInNetWorth}
          onChange={(e) => set("includeInNetWorth", e.target.checked)}
        />
      </label>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "color-mix(in srgb, var(--red) 12%, transparent)",
            color: "var(--red)",
          }}
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={pending || !v.name.trim()}
        className="btn btn-primary w-full"
      >
        {pending ? <Loader2 size={18} className="animate-spin" /> : "Save account"}
      </button>

      {v.id && (
        <>
          <button
            onClick={() =>
              start(async () => {
                await setAccountActive(v.id!, !(v.isActive ?? true));
                router.push("/accounts");
                router.refresh();
              })
            }
            className="btn btn-ghost w-full"
          >
            {v.isActive === false ? "Restore account" : "Archive account"}
          </button>
          <p className="muted text-center text-xs">
            Archiving hides it and leaves every transaction intact.
          </p>

          {/* Deleting is only offered when nothing would be lost by it. */}
          {postingCount === 0 ? (
            confirmingDelete ? (
              <div className="panel px-4 py-4 text-center">
                <p className="text-sm font-semibold">Delete {v.name}?</p>
                <p className="muted mt-1 text-xs">
                  Nothing has moved through it, so nothing is lost.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="btn btn-ghost flex-1"
                  >
                    Keep it
                  </button>
                  <button
                    disabled={pending}
                    className="btn btn-primary flex-1"
                    style={{ background: "var(--red)" }}
                    onClick={() =>
                      start(async () => {
                        const r = await removeAccount(v.id!);
                        if (r.ok) {
                          router.push("/accounts");
                          router.refresh();
                        } else setError(r.error);
                      })
                    }
                  >
                    {pending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Delete"
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="btn btn-danger w-full"
              >
                <Trash2 size={16} /> Delete permanently
              </button>
            )
          ) : (
            <p className="muted text-center text-xs">
              {postingCount} transaction{postingCount === 1 ? "" : "s"} moved
              through this account, so it can&apos;t be deleted — that would
              unbalance them. Archive it instead.
            </p>
          )}
        </>
      )}
    </div>
  );
}
