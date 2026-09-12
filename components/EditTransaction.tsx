"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, X } from "lucide-react";
import { editTransaction, editTransactionDetails } from "@/lib/actions";
import { fromMinor, toMinor } from "@/lib/money";
import type { Currency } from "@/lib/db/schema";

type Option = { id: number; name: string };

/**
 * Correcting a typo shouldn't mean deleting and re-entering. Expense and
 * income can be fully re-stated; every other type only exposes date, title and
 * note, because rewriting a transfer or a loan silently moves two balances.
 */
export default function EditTransaction({
  id,
  type,
  date,
  description,
  note,
  amountMinor,
  currency,
  accountId,
  categoryId,
  accounts,
  categories,
}: {
  id: number;
  type: string;
  date: string;
  description: string;
  note: string | null;
  amountMinor: number;
  currency: Currency;
  accountId: number | null;
  categoryId: number | null;
  accounts: Option[];
  categories: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const simple = type === "expense" || type === "income";

  const [form, setForm] = useState({
    date,
    description,
    note: note ?? "",
    amount: String(fromMinor(Math.abs(amountMinor), currency)),
    accountId: accountId ?? accounts[0]?.id ?? 0,
    categoryId: categoryId ?? categories[0]?.id ?? 0,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setError(null);
    start(async () => {
      const result = simple
        ? await editTransaction({
            id,
            date: form.date,
            type: type as "expense" | "income",
            accountId: Number(form.accountId),
            categoryId: Number(form.categoryId),
            amountMinor: toMinor(form.amount || "0", currency),
            description: form.description.trim(),
            note: form.note.trim() || null,
          })
        : await editTransactionDetails({
            id,
            date: form.date,
            description: form.description.trim(),
            note: form.note.trim() || null,
          });

      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        <Pencil size={16} /> Edit
      </button>
    );
  }

  return (
    <div className="panel px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Edit</h2>
        <button
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="muted grid h-8 w-8 place-items-center rounded-full"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3">
        {simple && (
          <div>
            <label className="label" htmlFor="ed-amount">
              Amount
            </label>
            <input
              id="ed-amount"
              className="field num"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="ed-date">
            Date
          </label>
          <input
            id="ed-date"
            type="date"
            className="field"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </div>

        {simple && (
          <>
            <div>
              <label className="label" htmlFor="ed-account">
                Account
              </label>
              <select
                id="ed-account"
                className="field"
                value={form.accountId}
                onChange={(e) => set("accountId", Number(e.target.value))}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ed-category">
                Category
              </label>
              <select
                id="ed-category"
                className="field"
                value={form.categoryId}
                onChange={(e) => set("categoryId", Number(e.target.value))}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="label" htmlFor="ed-desc">
            Title
          </label>
          <input
            id="ed-desc"
            className="field"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="ed-note">
            Note
          </label>
          <input
            id="ed-note"
            className="field"
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </div>

        {!simple && (
          <p className="muted text-xs">
            Amounts on transfers, exchanges and lending can&apos;t be edited here
            — delete this entry and add it again so both sides stay correct.
          </p>
        )}

        {error && (
          <p className="neg text-sm" role="alert">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={pending}
          className="btn btn-primary w-full"
        >
          {pending ? <Loader2 size={17} className="animate-spin" /> : "Save changes"}
        </button>
      </div>
    </div>
  );
}
