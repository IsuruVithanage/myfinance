import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/db/schema";

/* ─────────────────────────────── money ───────────────────────────── */

export function Money({
  minor,
  currency,
  signed,
  tone = "auto",
  className,
  compact,
  trimZeros,
}: {
  minor: number;
  currency: Currency;
  signed?: boolean;
  /** "auto" colours by sign; "plain" stays white. */
  tone?: "auto" | "plain" | "pos" | "neg" | "muted";
  className?: string;
  compact?: boolean;
  trimZeros?: boolean;
}) {
  const toneClass =
    tone === "plain"
      ? ""
      : tone === "muted"
        ? "muted"
        : tone === "pos"
          ? "pos"
          : tone === "neg"
            ? "neg"
            : minor > 0
              ? "pos"
              : minor < 0
                ? "neg"
                : "muted";

  return (
    <span className={cn("num", toneClass, className)}>
      {formatMoney(minor, currency, { signed, compact, trimZeros })}
    </span>
  );
}

/* ─────────────────────────────── layout ──────────────────────────── */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="title-lg">{title}</h1>
        {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({
  children,
  href,
  hrefLabel = "All",
}: {
  children: ReactNode;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-2.5 mt-8 flex items-baseline justify-between">
      <h2 className="eyebrow">{children}</h2>
      {href && (
        <Link href={href} className="pos text-sm font-medium">
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}

/** One row of a grouped list. Label left, value right, optional chevron. */
export function Row({
  href,
  title,
  subtitle,
  value,
  meta,
  leading,
  chevron,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  chevron?: boolean;
}) {
  const body = (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.975rem] font-medium leading-tight">
          {title}
        </p>
        {subtitle && (
          <p className="muted mt-0.5 truncate text-[0.8rem]">{subtitle}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {value}
        {meta && <p className="muted text-[0.75rem]">{meta}</p>}
      </div>
      {chevron && href && (
        <ChevronRight size={16} className="faint -mr-1 shrink-0" />
      )}
    </div>
  );

  return (
    <li className="hairline">
      {href ? (
        <Link href={href} className="block active:opacity-50">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      {body && <p className="muted max-w-[17rem] text-sm">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "pos" | "neg" | "warn";
}) {
  const fg =
    tone === "pos"
      ? "var(--green)"
      : tone === "neg"
        ? "var(--red)"
        : tone === "warn"
          ? "var(--amber)"
          : "var(--ash)";

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[0.72rem] font-semibold"
      style={{
        color: fg,
        background: `color-mix(in srgb, ${fg} 14%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

/** Thin progress bar for budgets and credit utilisation. */
export function Meter({
  value,
  tone = "pos",
}: {
  /** 0–1; above 1 renders full. */
  value: number;
  tone?: "pos" | "warn" | "neg";
}) {
  const color =
    tone === "neg"
      ? "var(--red)"
      : tone === "warn"
        ? "var(--amber)"
        : "var(--green)";

  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full"
      style={{ background: "var(--surface-2)" }}
      role="progressbar"
      aria-valuenow={Math.round(Math.min(1, Math.max(0, value)) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.min(100, Math.max(0, value * 100))}%`,
          background: color,
        }}
      />
    </div>
  );
}

/* ───────────────────────────── icon tiles ───────────────────────── */

/**
 * The small glyph that anchors every row. Neutral by default; tinted only
 * when the row itself is about money moving in or out.
 */
export function IconTile({
  icon: Icon,
  tone = "neutral",
  shape = "square",
  size = 38,
}: {
  icon: LucideIcon;
  tone?: "neutral" | "pos" | "neg";
  shape?: "square" | "circle";
  size?: number;
}) {
  const fg =
    tone === "pos" ? "var(--green)" : tone === "neg" ? "var(--red)" : "var(--ash)";
  const bg =
    tone === "neutral"
      ? "var(--surface-2)"
      : `color-mix(in srgb, ${fg} 16%, transparent)`;

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        borderRadius: shape === "circle" ? "9999px" : "0.7rem",
      }}
    >
      <Icon size={Math.round(size * 0.46)} strokeWidth={2} />
    </span>
  );
}

/* ──────────────────────────── progress ring ─────────────────────── */

/**
 * Circular progress with the headline number in the middle — the one chart
 * on the dashboard, because it answers a single question.
 */
export function Ring({
  value,
  size = 84,
  thickness = 8,
  tone = "pos",
  children,
}: {
  /** 0–1; clamped. */
  value: number;
  size?: number;
  thickness?: number;
  tone?: "pos" | "neg";
  children?: ReactNode;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const color = tone === "neg" ? "var(--red)" : "var(--green)";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(clamped * 100)} percent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────── change badge ───────────────────────── */

/** "12% up" next to a category — direction is the point, so it gets an arrow. */
export function Change({
  ratio,
  /** For spending, up is bad. For income, up is good. */
  invert = false,
}: {
  ratio: number | null;
  invert?: boolean;
}) {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  const up = ratio > 0;
  const good = invert ? up : !up;
  const Arrow = up ? TrendingUp : TrendingDown;

  return (
    <span
      className="num inline-flex items-center gap-0.5 text-[0.72rem] font-semibold"
      style={{ color: good ? "var(--green)" : "var(--red)" }}
    >
      {Math.abs(Math.round(ratio * 100))}%
      <Arrow size={12} strokeWidth={2.5} />
    </span>
  );
}

/* ──────────────────────────── stat tile ─────────────────────────── */

/** The compact card in a scrolling strip: glyph, amount, label, change. */
export function StatTile({
  icon,
  label,
  value,
  change,
  tone = "neutral",
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  change?: number | null;
  tone?: "neutral" | "pos" | "neg";
  href?: string;
}) {
  const body = (
    <div className="panel flex w-[7.75rem] shrink-0 flex-col gap-2.5 px-3.5 py-3.5">
      <IconTile icon={icon} tone={tone} shape="circle" size={34} />
      <div>
        <p className="num text-[0.98rem] font-bold leading-tight">{value}</p>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <p className="muted truncate text-[0.75rem]">{label}</p>
          {change != null && <Change ratio={change} />}
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="shrink-0 active:opacity-60">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ───────────────────────────── legend ───────────────────────────── */

export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string; value?: ReactNode }>;
}) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-[0.82rem]">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: i.color }}
          />
          <span className="muted min-w-0 flex-1 truncate">{i.label}</span>
          {i.value && <span className="num shrink-0">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}
