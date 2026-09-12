import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { getCardsOverview } from "@/lib/queries";
import { dueTone, utilisationTone } from "@/lib/cards";
import { EmptyState, Meter, Money, PageHeader, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const cards = await getCardsOverview();

  return (
    <div>
      <PageHeader
        title="Cards"
        action={
          <Link
            href="/accounts/new"
            aria-label="Add a card"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--surface-2)", color: "var(--green)" }}
          >
            <Plus size={20} />
          </Link>
        }
      />

      {cards.length === 0 ? (
        <EmptyState
          title="No credit cards yet"
          body="Add one with its statement and due day, and you'll be warned before every bill."
          action={
            <Link href="/accounts/new" className="btn btn-primary">
              Add a card
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {cards.map((c) => {
            const tone = dueTone(c.cycle.daysUntilDue, c.settled);
            const uTone = utilisationTone(c.utilisation);
            const days = c.cycle.daysUntilDue;

            return (
              <li key={c.id} className="panel px-4 py-4">
                {/* headline: what you owe, and whether it is urgent */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="muted text-[0.8rem]">
                      {[c.institution, c.last4 && `•••• ${c.last4}`]
                        .filter(Boolean)
                        .join(" · ") || c.currency}
                    </p>
                  </div>
                  <Pill
                    tone={
                      c.settled
                        ? "pos"
                        : tone === "urgent"
                          ? "neg"
                          : tone === "warn"
                            ? "warn"
                            : "neutral"
                    }
                  >
                    {c.settled
                      ? "Settled"
                      : days < 0
                        ? `${Math.abs(days)}d overdue`
                        : days === 0
                          ? "Due today"
                          : `${days}d left`}
                  </Pill>
                </div>

                <Money
                  minor={-c.balanceMinor}
                  currency={c.currency}
                  tone={c.balanceMinor < 0 ? "neg" : "plain"}
                  className="mt-3 block text-[1.75rem] font-bold leading-none"
                />
                <p className="muted mt-1.5 text-[0.8rem]">
                  {/* When the statement is settled, nothing is due on that date —
                      the balance is building toward the next one. */}
                  {c.settled
                    ? `Owed now · builds until ${format(c.cycle.nextStatementClose, "d MMM")}`
                    : `Owed now · due ${format(c.cycle.dueDate, "d MMM")}`}
                </p>

                {c.utilisation != null && (
                  <div className="mt-4">
                    <Meter
                      value={c.utilisation}
                      tone={
                        uTone === "urgent" ? "neg" : uTone === "warn" ? "warn" : "pos"
                      }
                    />
                    <p className="muted mt-1.5 text-[0.75rem]">
                      <Money
                        minor={c.availableMinor}
                        currency={c.currency}
                        tone="muted"
                        trimZeros
                      />{" "}
                      available of{" "}
                      <Money
                        minor={c.cardDetail.creditLimitMinor}
                        currency={c.currency}
                        tone="muted"
                        trimZeros
                      />
                    </p>
                  </div>
                )}

                {!c.settled && (
                  <p className="muted mt-3 text-[0.8rem]">
                    This statement{" "}
                    <Money
                      minor={c.outstandingMinor}
                      currency={c.currency}
                      tone="plain"
                    />
                    {c.minPaymentMinor > 0 && (
                      <>
                        {" · minimum "}
                        <Money
                          minor={c.minPaymentMinor}
                          currency={c.currency}
                          tone="muted"
                        />
                      </>
                    )}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <Link href="/add" className="btn btn-primary flex-1">
                    Pay
                  </Link>
                  <Link href={`/accounts/${c.id}`} className="btn btn-ghost flex-1">
                    Activity
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
