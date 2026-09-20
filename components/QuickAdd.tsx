"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Delete, Loader2, Plus, X } from "lucide-react";
import {
  addExchange,
  addExpense,
  addIncome,
  addPeopleMove,
  addTransfer,
  removeTransaction,
  type ActionResult,
} from "@/lib/actions";
import { CURRENCY_META, formatMoney, toMinor } from "@/lib/money";
import type { Currency } from "@/lib/db/schema";
import { cn } from "@/lib/cn";

type Account = {
  id: number;
  name: string;
  type: string;
  currency: Currency;
  color: string;
  balanceMinor: number;
};
type Category = {
  id: number;
  name: string;
  kind: "expense" | "income";
  color: string;
  /** Fees, FX difference, adjustments — booked automatically, never picked. */
  isSystem: boolean;
};
type Person = { id: number; name: string };

type Mode =
  | "expense"
  | "income"
  | "transfer"
  | "lend"
  | "collect"
  | "borrow"
  | "settle";

const MODES: Array<{ key: Mode; label: string }> = [
  { key: "expense", label: "Spent" },
  { key: "income", label: "Received" },
  { key: "transfer", label: "Transfer" },
  { key: "lend", label: "Lent out" },
  { key: "collect", label: "Got back" },
  { key: "borrow", label: "Borrowed" },
  { key: "settle", label: "Paid back" },
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Remember the account you used last for each mode — one less tap, every time. */
const LAST_ACCOUNT_KEY = "myfinance:lastAccount";

export default function QuickAdd({
  accounts,
  categories,
  people,
  frequentExpense,
  frequentIncome,
}: {
  accounts: Account[];
  categories: Category[];
  people: Person[];
  frequentExpense: number[];
  frequentIncome: number[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [mode, setMode] = useState<Mode>("expense");
  const [amount, setAmount] = useState("");
  const [secondary, setSecondary] = useState(""); // exchange: amount received
  const [fee, setFee] = useState("");
  const [focus, setFocus] = useState<"amount" | "secondary" | "fee">("amount");

  const [accountId, setAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; label: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPeople = ["lend", "collect", "borrow", "settle"].includes(mode);
  const isTwoAccount = mode === "transfer";
  const needsCategory = mode === "expense" || mode === "income";

  const ownAccounts = useMemo(
    () => accounts.filter((a) => !["receivable", "payable"].includes(a.type)),
    [accounts],
  );

  const account = ownAccounts.find((a) => a.id === accountId) ?? null;
  const toAccount = ownAccounts.find((a) => a.id === toAccountId) ?? null;
  const currency: Currency = account?.currency ?? "LKR";
  const secondaryCurrency: Currency = toAccount?.currency ?? "USD";
  /**
   * Moving money between currencies needs two amounts: what left one account
   * and what landed in the other. No rate is computed or shown — the bank
   * already decided that, and both figures are on the statement.
   */
  const isCrossCurrency =
    isTwoAccount && !!toAccount && toAccount.currency !== currency;

  // Switching to a same-currency destination hides the second input; make
  // sure the keypad isn't still typing into it.
  useEffect(() => {
    if (!isCrossCurrency && focus === "secondary") setFocus("amount");
  }, [isCrossCurrency, focus]);

  /* restore the last account used for this mode */
  useEffect(() => {
    if (ownAccounts.length === 0) return;
    let stored: Record<string, number> = {};
    try {
      stored = JSON.parse(localStorage.getItem(LAST_ACCOUNT_KEY) ?? "{}");
    } catch {
      stored = {};
    }
    const remembered = ownAccounts.find((a) => a.id === stored[mode]);
    // Default to somewhere money actually sits, not the first card in the list.
    const fallback =
      ownAccounts.find((a) => ["cash", "wallet", "bank"].includes(a.type)) ??
      ownAccounts[0];
    setAccountId(remembered?.id ?? fallback.id);
    setToAccountId(null);
  }, [mode, ownAccounts]);

  useEffect(() => {
    if (!accountId) return;
    try {
      const stored = JSON.parse(localStorage.getItem(LAST_ACCOUNT_KEY) ?? "{}");
      localStorage.setItem(
        LAST_ACCOUNT_KEY,
        JSON.stringify({ ...stored, [mode]: accountId }),
      );
    } catch {
      /* private mode — remembering is a nicety, not a requirement */
    }
  }, [accountId, mode]);

  /* categories, most-used first */
  const shownCategories = useMemo(() => {
    if (!needsCategory) return [];
    const kind = mode === "expense" ? "expense" : "income";
    const frequent = mode === "expense" ? frequentExpense : frequentIncome;
    const pool = categories.filter((c) => c.kind === kind && !c.isSystem);
    const rank = new Map(frequent.map((id, i) => [id, i]));
    return [...pool].sort((a, b) => {
      const ra = rank.get(a.id) ?? 999;
      const rb = rank.get(b.id) ?? 999;
      return ra - rb || a.name.localeCompare(b.name);
    });
  }, [categories, frequentExpense, frequentIncome, mode, needsCategory]);

  useEffect(() => {
    setCategoryId(null);
    setFocus("amount");
  }, [mode]);

  /* ── keypad ───────────────────────────────────────────────────── */

  function press(key: string) {
    const setter =
      focus === "amount" ? setAmount : focus === "secondary" ? setSecondary : setFee;
    const current = focus === "amount" ? amount : focus === "secondary" ? secondary : fee;

    if (navigator.vibrate) navigator.vibrate(8);

    if (key === "del") return setter(current.slice(0, -1));
    if (key === ".") {
      if (current.includes(".")) return;
      return setter((current || "0") + ".");
    }
    // cap at 2 decimal places — both our currencies use cents
    if (current.includes(".") && current.split(".")[1].length >= 2) return;
    if (current === "0" && key !== ".") return setter(key);
    setter(current + key);
  }

  const amountMinor = toMinor(amount || "0", currency);
  const secondaryMinor = toMinor(secondary || "0", secondaryCurrency);
  const feeMinor = toMinor(fee || "0", currency);

  /* ── submit ───────────────────────────────────────────────────── */

  const canSave =
    amountMinor > 0 &&
    !!accountId &&
    (!needsCategory || !!categoryId) &&
    (!isTwoAccount || (!!toAccountId && toAccountId !== accountId)) &&
    (!isCrossCurrency || secondaryMinor > 0) &&
    (!isPeople || !!personId);

  function showToast(id: number, label: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id, label });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  function reset(keepContext = true) {
    setAmount("");
    setSecondary("");
    setFee("");
    setNote("");
    setFocus("amount");
    if (!keepContext) {
      setCategoryId(null);
      setPersonId(null);
    }
  }

  function save() {
    if (!canSave || pending) return;
    setError(null);

    const feeCategory = categories.find((c) => c.name === "Bank Fees");
    const common = {
      date,
      description: note.trim(),
      amountMinor,
      feeMinor,
      feeCategoryId: feeMinor > 0 ? (feeCategory?.id ?? null) : null,
    };

    start(async () => {
      let result: ActionResult;

      switch (mode) {
        case "expense":
          result = await addExpense({
            ...common,
            accountId: accountId!,
            categoryId: categoryId!,
          });
          break;
        case "income":
          result = await addIncome({
            ...common,
            accountId: accountId!,
            categoryId: categoryId!,
          });
          break;
        case "transfer":
          result = isCrossCurrency
            ? await addExchange({
                date,
                description: note.trim(),
                fromAccountId: accountId!,
                toAccountId: toAccountId!,
                fromAmountMinor: amountMinor,
                toAmountMinor: secondaryMinor,
                feeMinor,
                feeCategoryId: feeMinor > 0 ? (feeCategory?.id ?? null) : null,
                feeCurrency: currency,
              })
            : await addTransfer({
                ...common,
                fromAccountId: accountId!,
                toAccountId: toAccountId!,
              });
          break;
        default:
          result = await addPeopleMove({
            date,
            type: mode as "lend" | "collect" | "borrow" | "settle",
            accountId: accountId!,
            counterpartyId: personId!,
            amountMinor,
            description: note.trim(),
          });
      }

      if (result.ok) {
        if (navigator.vibrate) navigator.vibrate([12, 40, 12]);
        showToast(
          result.id ?? 0,
          `${formatMoney(amountMinor, currency)} saved`,
        );
        reset();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function undo() {
    if (!toast) return;
    const id = toast.id;
    setToast(null);
    start(async () => {
      await removeTransaction(id);
      router.refresh();
    });
  }

  /* ── render ───────────────────────────────────────────────────── */

  if (ownAccounts.length === 0) {
    return (
      <div className="panel px-6 py-10 text-center">
        <p className="font-semibold">No accounts yet</p>
        <p className="muted mt-1 text-sm">
          Add a wallet or bank account first, then you can record transactions.
        </p>
        <Link href="/accounts/new" className="btn btn-primary mt-4 inline-flex">
          Add an account
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-[19rem]">
      {/* mode chips */}
      <div className="hide-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className="chip"
            aria-pressed={mode === m.key}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* amount — the one thing this screen is for */}
      <div className="px-1 py-6 text-center">
        <button
          onClick={() => setFocus("amount")}
          className="block w-full"
          aria-label="Amount"
        >
          <span
            className="eyebrow block"
            style={{ color: focus === "amount" ? "var(--green)" : undefined }}
          >
            {isCrossCurrency ? "Leaves as" : "Amount"}
          </span>
          <span
            className="num mt-2 block text-[3rem] font-bold leading-none"
            style={{ color: amount ? "var(--ink)" : "var(--ash-dim)" }}
          >
            <span className="muted text-[1.5rem] font-semibold">
              {CURRENCY_META[currency].symbol}
            </span>{" "}
            {amount || "0"}
          </span>
        </button>

        {isCrossCurrency && (
          <button
            onClick={() => setFocus("secondary")}
            className="mt-4 block w-full"
            aria-label="Amount arriving"
          >
            <span
              className="eyebrow block"
              style={{ color: focus === "secondary" ? "var(--green)" : undefined }}
            >
              Arrives as
            </span>
            <span
              className="num mt-1 block text-2xl font-bold"
              style={{ color: secondary ? "var(--ink)" : "var(--ash-dim)" }}
            >
              {CURRENCY_META[secondaryCurrency].symbol} {secondary || "0"}
            </span>
          </button>
        )}

        {(fee || focus === "fee") && (
          <button
            onClick={() => setFocus("fee")}
            className="mt-3 block w-full"
            aria-label="Fee"
          >
            <span className="muted num text-sm">
              + fee {CURRENCY_META[currency].symbol} {fee || "0"}
            </span>
          </button>
        )}
      </div>

      {/* accounts */}
      <Row label={isTwoAccount ? "From" : isPeople ? "Money moves through" : "Account"}>
        {ownAccounts.map((a) => (
          <Chip
            key={a.id}
            selected={accountId === a.id}
            onClick={() => setAccountId(a.id)}
          >
            {a.name}
            <span className="ml-1 opacity-60">{a.currency}</span>
          </Chip>
        ))}
      </Row>

      {isTwoAccount && (
        <Row label="To">
          {ownAccounts
            .filter((a) => a.id !== accountId)
            .map((a) => (
              <Chip
                key={a.id}
                selected={toAccountId === a.id}
                  onClick={() => setToAccountId(a.id)}
              >
                {a.name}
                <span className="ml-1 opacity-60">{a.currency}</span>
              </Chip>
            ))}
        </Row>
      )}

      {isPeople && (
        <Row label="Person">
          {people.map((p) => (
            <Chip
              key={p.id}
              selected={personId === p.id}
              onClick={() => setPersonId(p.id)}
            >
              {p.name}
            </Chip>
          ))}
          <Link href="/people/new" className="shrink-0">
            <Chip selected={false}>
              <Plus size={14} /> New
            </Chip>
          </Link>
        </Row>
      )}

      {needsCategory && (
        <Row label="Category" wrap>
          {shownCategories.map((c) => (
            <Chip
              key={c.id}
              selected={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </Chip>
          ))}
        </Row>
      )}

      {/* extras */}
      <div className="mt-4">
        <button
          onClick={() => setShowExtras((v) => !v)}
          className="btn-plain text-sm font-medium"
        >
          {showExtras ? "Hide" : "Date, note, fee"}
        </button>

        {showExtras && (
          <div className="pop panel mt-2 space-y-3 px-4 py-4">
            <div>
              <label className="label" htmlFor="qa-date">
                Date
              </label>
              <div className="flex gap-2">
                <input
                  id="qa-date"
                  type="date"
                  className="field"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <button
                  className="btn btn-ghost shrink-0"
                  onClick={() => setDate(todayIso())}
                >
                  Today
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="qa-note">
                Note
              </label>
              <input
                id="qa-note"
                className="field"
                placeholder="Keells, lunch with Amal…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Fee charged</label>
              <button
                className="btn btn-ghost w-full justify-start"
                onClick={() => setFocus("fee")}
              >
                {feeMinor > 0
                  ? formatMoney(feeMinor, currency)
                  : "Tap, then type the fee on the keypad"}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p
          className="mt-3 rounded-lg px-3 py-2 text-sm"
          style={{
            background: "color-mix(in srgb, var(--red) 12%, transparent)",
            color: "var(--red)",
          }}
          role="alert"
        >
          {error}
        </p>
      )}

      {/* toast */}
      {toast && (
        <div
          className="pop fixed inset-x-0 z-50 mx-auto flex w-[min(26rem,92vw)] items-center gap-3 rounded-xl px-4 py-3 shadow-lg"
          style={{
            bottom: "calc(19.5rem + env(safe-area-inset-bottom))",
            background: "var(--surface-2)",
            color: "var(--ink)",
          }}
          role="status"
        >
          <Check size={17} className="pos" />
          <span className="flex-1 text-sm font-medium">{toast.label}</span>
          <button onClick={undo} className="pos text-sm font-bold">
            Undo
          </button>
          <button onClick={() => setToast(null)} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}

      {/* keypad */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 px-3 pt-2.5"
        style={{
          background: "var(--black)",
          borderTop: "1px solid var(--line)",
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto max-w-md">
          <div className="grid grid-cols-3 gap-1.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map(
              (k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  aria-label={k === "del" ? "Delete" : k}
                  className="num grid h-[3.25rem] place-items-center rounded-2xl text-2xl font-medium active:scale-95"
                  style={{
                    background: "var(--key)",
                    transition: "transform .08s ease",
                  }}
                >
                  {k === "del" ? <Delete size={20} /> : k}
                </button>
              ),
            )}
          </div>
          <button
            onClick={save}
            disabled={!canSave || pending}
            className="btn btn-primary mt-2.5 h-[3.25rem] w-full text-base"
          >
            {pending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <Check size={18} />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── small pieces ───────────────────────────────────────────────── */

function Row({
  label,
  children,
  wrap,
}: {
  label: string;
  children: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <div className="mt-4">
      <p className="eyebrow mb-2">{label}</p>
      <div
        className={cn(
          "gap-1.5",
          wrap
            ? "flex flex-wrap"
            : "hide-scrollbar -mx-4 flex overflow-x-auto px-4 pb-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Chip({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} aria-pressed={selected} className="chip">
      {children}
    </button>
  );
}
