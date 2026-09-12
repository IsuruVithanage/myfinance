import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  setDate,
  startOfDay,
  subMonths,
} from "date-fns";

/** Banks bill on "the 28th"; February has 28 days. Clamp, never overflow. */
export function clampToMonth(reference: Date, day: number): Date {
  const last = endOfMonth(reference).getDate();
  return setDate(reference, Math.min(day, last));
}

export type CardCycle = {
  /** Close date of the statement you currently owe on. */
  statementClose: Date;
  /** Start of that statement period (exclusive lower bound). */
  statementStart: Date;
  /** When that statement must be paid. */
  dueDate: Date;
  /** Close date of the cycle currently accumulating. */
  nextStatementClose: Date;
  /** Negative once overdue. */
  daysUntilDue: number;
};

/**
 * Work out where a card sits in its billing cycle.
 *
 * A statement closing on the 25th with dueDay 15 and dueMonthOffset 1 is due
 * on the 15th of the following month. If that due date has already passed, the
 * statement you owe on is the next one down the line.
 */
export function getCardCycle(
  today: Date,
  statementDay: number,
  dueDay: number,
  dueMonthOffset = 1,
): CardCycle {
  const t = startOfDay(today);

  // Most recent statement close on or before today.
  let close = clampToMonth(t, statementDay);
  if (close > t) close = clampToMonth(subMonths(t, 1), statementDay);

  let dueDate = clampToMonth(addMonths(close, dueMonthOffset), dueDay);

  // If that bill's due date is already behind us, the live obligation is the
  // statement that closed one cycle later.
  if (dueDate < t) {
    close = clampToMonth(addMonths(close, 1), statementDay);
    dueDate = clampToMonth(addMonths(close, dueMonthOffset), dueDay);
  }

  const statementStart = clampToMonth(subMonths(close, 1), statementDay);

  return {
    statementClose: close,
    statementStart,
    dueDate,
    nextStatementClose: clampToMonth(addMonths(close, 1), statementDay),
    daysUntilDue: differenceInCalendarDays(dueDate, t),
  };
}

export const iso = (d: Date) => format(d, "yyyy-MM-dd");
export const fromIso = (s: string) => parseISO(s);

/** 0–1+; > 1 means over the limit. Returns null when no limit is set. */
export function utilisation(
  balanceMinor: number,
  creditLimitMinor: number,
): number | null {
  if (creditLimitMinor <= 0) return null;
  const owed = Math.max(0, -balanceMinor); // card balances are negative when owed
  return owed / creditLimitMinor;
}

export function utilisationTone(u: number | null): "ok" | "warn" | "urgent" {
  if (u == null) return "ok";
  if (u >= 0.9) return "urgent";
  if (u >= 0.7) return "warn";
  return "ok";
}

export function dueTone(daysUntilDue: number, settled: boolean): "ok" | "warn" | "urgent" {
  if (settled) return "ok";
  if (daysUntilDue < 0) return "urgent";
  if (daysUntilDue <= 3) return "urgent";
  if (daysUntilDue <= 7) return "warn";
  return "ok";
}
