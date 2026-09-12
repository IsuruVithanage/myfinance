import type { Currency } from "@/lib/db/schema";

export const CURRENCIES = ["LKR", "USD"] as const;

/** Everything is reported in this currency. Client-safe on purpose. */
export const BASE_CURRENCY: Currency = "LKR";

export const CURRENCY_META: Record<
  Currency,
  { symbol: string; code: Currency; decimals: number; name: string }
> = {
  LKR: { symbol: "Rs", code: "LKR", decimals: 2, name: "Sri Lankan Rupee" },
  USD: { symbol: "$", code: "USD", decimals: 2, name: "US Dollar" },
};

/** 10^decimals for a currency. Both LKR and USD use 100. */
export function minorFactor(currency: Currency): number {
  return 10 ** CURRENCY_META[currency].decimals;
}

/** "1,250.50" | 1250.5 → 125050 minor units. Rounds half-away-from-zero. */
export function toMinor(value: string | number, currency: Currency): number {
  const n =
    typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  const f = minorFactor(currency);
  return Math.sign(n) * Math.round(Math.abs(n) * f);
}

/** 125050 → 1250.5 (a display number; never use for further arithmetic). */
export function fromMinor(minor: number, currency: Currency): number {
  return minor / minorFactor(currency);
}

type FormatOptions = {
  /** Always show + or −. Default: only −. */
  signed?: boolean;
  /** Drop the decimal part when the amount is a whole unit. Default false. */
  trimZeros?: boolean;
  /** "Rs 1,250.50" (default) vs "LKR 1,250.50". */
  useCode?: boolean;
  /** 1_250_000 → "Rs 1.25M". Useful for tight mobile tiles. */
  compact?: boolean;
  /** Omit the symbol entirely — for input fields and tables. */
  bare?: boolean;
};

/** The single formatter the whole UI uses, so money never renders two ways. */
export function formatMoney(
  minor: number,
  currency: Currency,
  opts: FormatOptions = {},
): string {
  const meta = CURRENCY_META[currency];
  const abs = Math.abs(minor);
  const negative = minor < 0;
  const value = fromMinor(abs, currency);

  let body: string;
  if (opts.compact && abs >= 100_000 * minorFactor(currency)) {
    body = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } else {
    const fractionDigits =
      opts.trimZeros && abs % minorFactor(currency) === 0 ? 0 : meta.decimals;
    body = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  }

  const sign = negative ? "−" : opts.signed ? "+" : "";
  if (opts.bare) return `${sign}${body}`;
  const prefix = opts.useCode ? `${meta.code} ` : `${meta.symbol} `;
  return `${sign}${prefix}${body}`;
}

/** Accepts the messy things a thumb types: "1,200", "1200.", ".5", "1 200". */
export function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Tailwind class for a signed amount, consistent across every screen. */
export function amountTone(minor: number): string {
  if (minor > 0) return "text-emerald-600 dark:text-emerald-400";
  if (minor < 0) return "text-rose-600 dark:text-rose-400";
  return "text-neutral-500";
}
