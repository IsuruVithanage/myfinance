"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { archiveCategory, saveCategory, setUsdLkrRate } from "@/lib/actions";


/** The USD→LKR rate used to value USD balances and to convert new entries. */
export function RateForm({ current }: { current: number }) {
  const router = useRouter();
  const [rate, setRate] = useState(String(current));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="panel px-4 py-4">
      <h2 className="font-semibold">Exchange rate</h2>
      <p className="muted mt-0.5 text-sm">
        LKR per 1 USD. Used to show USD balances in rupees. Past transactions
        keep the rate they were recorded at.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          className="field num"
          inputMode="decimal"
          value={rate}
          onChange={(e) => {
            setRate(e.target.value);
            setSaved(false);
          }}
          aria-label="USD to LKR rate"
        />
        <button
          className="btn btn-primary shrink-0"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await setUsdLkrRate(today, Number(rate));
              if (r.ok) {
                setSaved(true);
                router.refresh();
              } else setError(r.error);
            })
          }
        >
          {pending ? (
            <Loader2 size={17} className="animate-spin" />
          ) : saved ? (
            <Check size={17} />
          ) : (
            "Save"
          )}
        </button>
      </div>
      {error && (
        <p className="neg mt-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Cat = {
  id: number;
  name: string;
  kind: "expense" | "income";
  color: string;
  icon: string;
  isSystem: boolean;
};

/** Create, rename and retire categories. Built-in ones can't be removed. */
export function CategoryManager({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    if (!name.trim()) return;
    start(async () => {
      setError(null);
      const r = await saveCategory({ name, kind });
      if (r.ok) {
        setName("");
        setAdding(false);
        router.refresh();
      } else setError(r.error);
    });
  }

  function rename(c: Cat) {
    if (!editName.trim() || editName === c.name) {
      setEditingId(null);
      return;
    }
    start(async () => {
      const r = await saveCategory({
        id: c.id,
        name: editName,
        kind: c.kind,
        icon: c.icon,
        color: c.color,
      });
      setEditingId(null);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  const groups: Array<["expense" | "income", string]> = [
    ["expense", "Spending"],
    ["income", "Income"],
  ];

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-4">
        <div>
          <h2 className="font-semibold">Categories</h2>
          <p className="muted mt-0.5 text-sm">
            Rename, retire, or add your own.
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          aria-label="Add a category"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--surface-2)", color: "var(--green)" }}
        >
          {adding ? <X size={17} /> : <Plus size={18} />}
        </button>
      </div>

      {adding && (
        <div className="pop space-y-2 px-4 pb-4">
          <input
            className="field"
            placeholder="Tuition, Barber, Side project…"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            aria-label="New category name"
          />
          <div className="flex gap-1.5">
            {groups.map(([k, labelText]) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className="chip flex-1 justify-center"
                aria-pressed={kind === k}
              >
                {labelText}
              </button>
            ))}
          </div>
          <button
            onClick={create}
            disabled={pending || !name.trim()}
            className="btn btn-primary w-full"
          >
            {pending ? <Loader2 size={17} className="animate-spin" /> : "Add category"}
          </button>
        </div>
      )}

      {error && (
        <p className="neg px-4 pb-2 text-sm" role="alert">
          {error}
        </p>
      )}

      {groups.map(([k, labelText]) => {
        const rows = categories.filter((c) => c.kind === k);
        if (rows.length === 0) return null;
        return (
          <div key={k}>
            <p className="eyebrow px-4 pb-1 pt-3">{labelText}</p>
            <ul>
              {rows.map((c) => (
                <li
                  key={c.id}
                  className="hairline flex items-center gap-3 px-4 py-2.5"
                >
                  {editingId === c.id ? (
                    <input
                      className="field flex-1"
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => rename(c)}
                      onKeyDown={(e) => e.key === "Enter" && rename(c)}
                      aria-label={`Rename ${c.name}`}
                    />
                  ) : (
                    <button
                      className="min-w-0 flex-1 truncate text-left text-sm"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditName(c.name);
                      }}
                    >
                      {c.name}
                      {c.isSystem && (
                        <span className="faint ml-2 text-[0.7rem]">built-in</span>
                      )}
                    </button>
                  )}

                  {!c.isSystem && editingId !== c.id && (
                    <button
                      aria-label={`Remove ${c.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ color: "var(--red)" }}
                      onClick={() =>
                        start(async () => {
                          const r = await archiveCategory(c.id);
                          if (r.ok) router.refresh();
                          else setError(r.error);
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
