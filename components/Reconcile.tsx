"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Scale, X } from "lucide-react";
import { addAdjustment } from "@/lib/actions";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";
import type { Currency } from "@/lib/db/schema";

/**
 * You counted your wallet and it disagrees with the app. Rather than quietly
 * overwriting the balance, this books the difference to the Adjustment
 * category so the gap stays visible in your reports.
 */
export default function Reconcile({
  accountId,
  currency,
  currentMinor,
}: {
  accountId: number;
  currency: Currency;
  currentMinor: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState(
    String(fromMinor(currentMinor, currency)),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const countedMinor = toMinor(counted || "0", currency);
  const delta = countedMinor - currentMinor;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        <Scale size={16} /> Reconcile balance
      </button>
    );
  }

  return (
    <div className="panel px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Reconcile</h2>
        <button
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="muted grid h-8 w-8 place-items-center rounded-full"
        >
          <X size={16} />
        </button>
      </div>

      <p className="muted text-sm">
        App says{" "}
        <span className="num" style={{ color: "var(--ink)" }}>
          {formatMoney(currentMinor, currency)}
        </span>
        . What did you actually count?
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <label className="label" htmlFor="rc-counted">
            Counted balance
          </label>
          <input
            id="rc-counted"
            className="field num"
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
        </div>

        {delta !== 0 && (
          <p className="text-sm">
            Difference{" "}
            <span
              className="num font-semibold"
              style={{ color: delta > 0 ? "var(--green)" : "var(--red)" }}
            >
              {formatMoney(delta, currency, { signed: true })}
            </span>{" "}
            <span className="muted">will be booked to Adjustment.</span>
          </p>
        )}

        <div>
          <label className="label" htmlFor="rc-note">
            Note (optional)
          </label>
          <input
            id="rc-note"
            className="field"
            placeholder="Counted the wallet"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error && (
          <p className="neg text-sm" role="alert">
            {error}
          </p>
        )}

        <button
          disabled={pending || delta === 0}
          className="btn btn-primary w-full"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await addAdjustment({
                date: new Date().toISOString().slice(0, 10),
                accountId,
                countedMinor,
                currentMinor,
                note: note.trim() || null,
              });
              if (r.ok) {
                setOpen(false);
                router.refresh();
              } else setError(r.error);
            })
          }
        >
          {pending ? (
            <Loader2 size={17} className="animate-spin" />
          ) : delta === 0 ? (
            "Already matches"
          ) : (
            "Book the difference"
          )}
        </button>
      </div>
    </div>
  );
}
