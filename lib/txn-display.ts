import type { Currency, TxnType } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";

export type Leg = {
  posting: {
    id: number;
    accountId: number | null;
    categoryId: number | null;
    amountMinor: number;
    currency: Currency;
    memo: string | null;
  };
  accountName: string | null;
  accountType: string | null;
  accountColor: string | null;
  categoryName: string | null;
  categoryKind: "expense" | "income" | null;
  categoryColor: string | null;
  categoryIcon: string | null;
};

export type TxnLike = {
  id: number;
  date: string;
  type: TxnType;
  description: string;
  person?: { name: string } | null;
  legs: Leg[];
};

export type TxnSummary = {
  title: string;
  subtitle: string;
  /** Signed, for colouring: negative = money left you. */
  amountMinor: number;
  currency: Currency;
  /** Secondary amount line, used by exchanges ("→ Rs 29,850"). */
  secondary?: string;
  accent: string;
  feeMinor: number;
  /** Lucide icon name; resolved by lib/icons. */
  icon: string;
};

const FEE_CATEGORIES = new Set(["Bank Fees", "Interest Paid"]);

/**
 * Turn a set of postings back into the one-line story a human wants to read.
 * Every list in the app renders through this, so a transaction never describes
 * itself two different ways.
 */
export function summarise(t: TxnLike): TxnSummary {
  const accountLegs = t.legs.filter((l) => l.posting.accountId != null);
  const categoryLegs = t.legs.filter((l) => l.posting.categoryId != null);

  const feeLegs = categoryLegs.filter(
    (l) => l.categoryName && FEE_CATEGORIES.has(l.categoryName),
  );
  const feeMinor = feeLegs.reduce((s, l) => s + l.posting.amountMinor, 0);
  const mainCategory = categoryLegs.find((l) => !feeLegs.includes(l));

  const outLeg = accountLegs.find((l) => l.posting.amountMinor < 0);
  const inLeg = accountLegs.find((l) => l.posting.amountMinor > 0);

  const fallbackCurrency: Currency =
    accountLegs[0]?.posting.currency ?? t.legs[0]?.posting.currency ?? "LKR";

  switch (t.type) {
    case "expense": {
      const amount = mainCategory?.posting.amountMinor ?? 0;
      return {
        title: t.description || mainCategory?.categoryName || "Expense",
        subtitle: [mainCategory?.categoryName, outLeg?.accountName]
          .filter(Boolean)
          .join(" · "),
        amountMinor: -amount,
        currency: mainCategory?.posting.currency ?? fallbackCurrency,
        accent: mainCategory?.categoryColor ?? "#64748b",
        feeMinor,
        icon: mainCategory?.categoryIcon ?? "tag",
      };
    }

    case "income": {
      const amount = -(mainCategory?.posting.amountMinor ?? 0);
      return {
        title: t.description || mainCategory?.categoryName || "Income",
        subtitle: [mainCategory?.categoryName, inLeg?.accountName]
          .filter(Boolean)
          .join(" · "),
        amountMinor: amount,
        currency: mainCategory?.posting.currency ?? fallbackCurrency,
        accent: mainCategory?.categoryColor ?? "#059669",
        feeMinor,
        icon: mainCategory?.categoryIcon ?? "circle-plus",
      };
    }

    case "transfer": {
      const amount = inLeg?.posting.amountMinor ?? 0;
      return {
        title: t.description || "Transfer",
        subtitle: `${outLeg?.accountName ?? "?"} → ${inLeg?.accountName ?? "?"}`,
        amountMinor: amount,
        currency: inLeg?.posting.currency ?? fallbackCurrency,
        accent: "#0ea5e9",
        feeMinor,
        icon: "arrow-left-right",
      };
    }

    case "exchange": {
      const from = outLeg;
      const to = inLeg;
      return {
        title: t.description || "Currency exchange",
        subtitle: `${from?.accountName ?? "?"} → ${to?.accountName ?? "?"}`,
        amountMinor: from?.posting.amountMinor ?? 0,
        currency: from?.posting.currency ?? fallbackCurrency,
        secondary: to
          ? `→ ${formatMoney(to.posting.amountMinor, to.posting.currency)}`
          : undefined,
        accent: "#14b8a6",
        feeMinor,
        icon: "arrow-left-right",
      };
    }

    case "lend":
    case "settle": {
      const cash = outLeg;
      return {
        title:
          t.description ||
          (t.type === "lend"
            ? `Lent to ${t.person?.name ?? "someone"}`
            : `Paid back ${t.person?.name ?? "someone"}`),
        subtitle: `${cash?.accountName ?? ""} · ${t.person?.name ?? ""}`.trim(),
        amountMinor: cash?.posting.amountMinor ?? 0,
        currency: cash?.posting.currency ?? fallbackCurrency,
        accent: t.type === "lend" ? "#0891b2" : "#c2410c",
        feeMinor,
        icon: t.type === "lend" ? "hand-coins" : "handshake",
      };
    }

    case "collect":
    case "borrow": {
      const cash = inLeg;
      return {
        title:
          t.description ||
          (t.type === "collect"
            ? `${t.person?.name ?? "Someone"} repaid you`
            : `Borrowed from ${t.person?.name ?? "someone"}`),
        subtitle: `${cash?.accountName ?? ""} · ${t.person?.name ?? ""}`.trim(),
        amountMinor: cash?.posting.amountMinor ?? 0,
        currency: cash?.posting.currency ?? fallbackCurrency,
        accent: t.type === "collect" ? "#0891b2" : "#c2410c",
        feeMinor,
        icon: t.type === "collect" ? "hand-coins" : "handshake",
      };
    }

    default: {
      const leg = accountLegs[0];
      return {
        title: t.description || "Adjustment",
        subtitle: leg?.accountName ?? "",
        amountMinor: leg?.posting.amountMinor ?? 0,
        currency: leg?.posting.currency ?? fallbackCurrency,
        accent: "#94a3b8",
        feeMinor,
        icon: "sliders-horizontal",
      };
    }
  }
}

export const TYPE_LABEL: Record<TxnType, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  exchange: "Exchange",
  lend: "Lent",
  collect: "Repaid to me",
  borrow: "Borrowed",
  settle: "Paid back",
  adjustment: "Adjustment",
};
