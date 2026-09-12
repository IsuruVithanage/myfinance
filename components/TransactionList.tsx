import Link from "next/link";
import { format, isThisYear, isToday, isYesterday, parseISO } from "date-fns";
import { IconTile, Money } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { summarise, type TxnLike } from "@/lib/txn-display";
import { iconFor } from "@/lib/icons";

function dayLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, isThisYear(d) ? "EEEE, d MMMM" : "d MMMM yyyy");
}

/**
 * Transactions grouped under day headings. Deliberately plain: a title, a grey
 * line of context, and the amount. Colour only ever comes from the number.
 */
export default function TransactionList({
  transactions,
  emptyMessage = "Nothing recorded yet.",
}: {
  transactions: TxnLike[];
  emptyMessage?: string;
}) {
  if (transactions.length === 0) {
    return (
      <p className="muted px-4 py-10 text-center text-sm">{emptyMessage}</p>
    );
  }

  const days = new Map<string, TxnLike[]>();
  for (const t of transactions) {
    const list = days.get(t.date) ?? [];
    list.push(t);
    days.set(t.date, list);
  }

  return (
    <div className="space-y-5">
      {[...days.entries()].map(([date, items]) => (
        <section key={date}>
          <h3 className="muted mb-2 px-1 text-[0.8rem] font-medium">
            {dayLabel(date)}
          </h3>
          <ul className="panel">
            {items.map((t) => {
              const s = summarise(t);
              return (
                <li key={t.id} className="hairline">
                  <Link
                    href={`/transactions/${t.id}`}
                    className="flex items-center gap-3 px-4 py-3 active:opacity-50"
                  >
                    <IconTile icon={iconFor(s.icon)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.975rem] font-medium leading-tight">
                        {s.title}
                      </p>
                      <p className="muted mt-0.5 truncate text-[0.8rem]">
                        {s.subtitle}
                        {s.feeMinor > 0 &&
                          ` · fee ${formatMoney(s.feeMinor, s.currency, { bare: true })}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money
                        minor={s.amountMinor}
                        currency={s.currency}
                        signed={s.amountMinor > 0}
                        className="text-[0.975rem] font-semibold"
                      />
                      {s.secondary && (
                        <p className="muted num text-[0.75rem]">{s.secondary}</p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
