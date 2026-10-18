"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteSubscription, saveSubscription } from "@/lib/actions";
import { CURRENCY_META, fromMinor, toMinor } from "@/lib/money";
import type { Currency, SubscriptionCycle } from "@/lib/db/schema";

type AccountOption = { id: number; name: string; currency: Currency };

export type SubscriptionDraft = {
  id?: number;
  name: string;
  amountMinor: number;
  currency: Currency;
  cycle: SubscriptionCycle;
  nextDate: string;
  autoRenew: boolean;
  accountId: number | null;
  note: string | null;
};

const CYCLES: Array<{ key: SubscriptionCycle; label: string }> = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

export default function SubscriptionForm({
  initial,
  accounts,
}: {
  initial?: SubscriptionDraft;
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const editing = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(
    initial ? String(fromMinor(initial.amountMinor, initial.currency)) : "",
  );
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "LKR");
  const [cycle, setCycle] = useState<SubscriptionCycle>(initial?.cycle ?? "monthly");
  const [nextDate, setNextDate] = useState(initial?.nextDate ?? "");
  const [autoRenew, setAutoRenew] = useState(initial?.autoRenew ?? true);
  const [accountId, setAccountId] = useState<number | null>(initial?.accountId ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const amountMinor = toMinor(amount || "0", currency);
  const canSave = !!name.trim() && amountMinor > 0 && !!nextDate;

  function pickAccount(a: AccountOption) {
    const next = accountId === a.id ? null : a.id;
    setAccountId(next);
    // It is billed in whatever the card or account holds.
    if (next) setCurrency(a.currency);
  }

  function save() {
    start(async () => {
      setError(null);
      const r = await saveSubscription({
        id: initial?.id,
        name,
        amountMinor,
        currency,
        cycle,
        nextDate,
        autoRenew,
        accountId,
        note: note.trim() || null,
      });
      if (r.ok) {
        router.push("/subscriptions");
        router.refresh();
      } else setError(r.error);
    });
  }

  function remove() {
    if (!initial?.id) return;
    start(async () => {
      const r = await deleteSubscription(initial.id!);
      if (r.ok) {
        router.push("/subscriptions");
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="panel space-y-4 px-4 py-4">
        <div>
          <label className="label" htmlFor="s-name">Name</label>
          <input
            id="s-name"
            className="field"
            placeholder="Netflix"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="s-amount">Costs</label>
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 gap-1">
              {(["LKR", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={currency === c}
                  className="chip"
                  onClick={() => setCurrency(c)}
                >
                  {CURRENCY_META[c].symbol}
                </button>
              ))}
            </div>
            <input
              id="s-amount"
              className="field num"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </div>
        </div>

        <div>
          <span className="label">Billed</span>
          <div className="flex gap-1.5">
            {CYCLES.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={cycle === c.key}
                className="chip"
                onClick={() => setCycle(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">When it ends</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-pressed={autoRenew}
              className="chip"
              onClick={() => setAutoRenew(true)}
            >
              Renews automatically
            </button>
            <button
              type="button"
              aria-pressed={!autoRenew}
              className="chip"
              onClick={() => setAutoRenew(false)}
            >
              Ends on a date
            </button>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="s-date">
            {autoRenew ? "Next renewal" : "Expires on"}
          </label>
          <input
            id="s-date"
            type="date"
            className="field num"
            style={{ colorScheme: "dark" }}
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
          />
          {autoRenew && (
            <p className="muted mt-1.5 text-[0.75rem]">
              Rolls forward on its own after each renewal.
            </p>
          )}
        </div>

        {accounts.length > 0 && (
          <div>
            <span className="label">Charged to (optional)</span>
            <div className="hide-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={accountId === a.id}
                  className="chip shrink-0"
                  onClick={() => pickAccount(a)}
                >
                  {a.name}
                  <span className="ml-1 opacity-60">{a.currency}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="s-note">Note (optional)</label>
          <input
            id="s-note"
            className="field"
            placeholder="Family plan, shared with…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

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
        disabled={pending || !canSave}
        className="btn btn-primary w-full"
        onClick={save}
      >
        {pending ? (
          <Loader2 size={18} className="animate-spin" />
        ) : editing ? (
          "Save"
        ) : (
          "Add subscription"
        )}
      </button>

      {editing &&
        (confirmDelete ? (
          <div className="panel space-y-3 px-4 py-4">
            <p className="muted text-sm">
              Remove <strong style={{ color: "var(--ink)" }}>{initial!.name}</strong>?
              Payments you already recorded stay in your history.
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-ghost flex-1"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </button>
              <button
                disabled={pending}
                className="btn btn-primary flex-1"
                style={{ background: "var(--red)" }}
                onClick={remove}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-danger w-full"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={16} /> Remove subscription
          </button>
        ))}
    </div>
  );
}
