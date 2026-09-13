import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { counterparties } from "@/lib/db/schema";
import { getPeopleOverview, getTransactions } from "@/lib/queries";
import { mergeCandidates, personUsage } from "@/lib/people";
import { BASE_CURRENCY } from "@/lib/money";
import { Money, PageHeader, Row, SectionTitle } from "@/components/ui";
import TransactionList from "@/components/TransactionList";
import PersonManager from "@/components/PersonManager";

export const dynamic = "force-dynamic";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);

  const [person] = await db
    .select()
    .from(counterparties)
    .where(eq(counterparties.id, personId))
    .limit(1);
  if (!person) notFound();

  const [overview, usage, candidates, txns] = await Promise.all([
    getPeopleOverview(),
    personUsage(personId),
    mergeCandidates(personId),
    getTransactions({ counterpartyId: personId, limit: 100 }),
  ]);

  const entry = overview.find((p) => p.person.id === personId);
  const net = entry?.netBase ?? 0;

  return (
    <div>
      <PageHeader
        title={person.name}
        subtitle={[person.phone, person.notes].filter(Boolean).join(" · ") || undefined}
      />

      <section className="panel px-5 py-5">
        <p className="eyebrow">
          {net > 0 ? "Owes you" : net < 0 ? "You owe them" : "All square"}
        </p>
        <Money
          minor={Math.abs(net)}
          currency={BASE_CURRENCY}
          tone={net > 0 ? "pos" : net < 0 ? "neg" : "muted"}
          className="mt-1.5 block text-[2rem] font-bold leading-none"
        />
      </section>

      {entry && entry.ledgers.filter((l) => l.balanceMinor !== 0).length > 0 && (
        <>
          <SectionTitle>Balances</SectionTitle>
          <ul className="panel">
            {entry.ledgers
              .filter((l) => l.balanceMinor !== 0)
              .map((l) => (
                <Row
                  key={l.id}
                  title={l.type === "receivable" ? "Owes you" : "You owe"}
                  subtitle={l.currency}
                  value={
                    <Money
                      minor={Math.abs(l.balanceMinor)}
                      currency={l.currency}
                      tone={l.type === "receivable" ? "pos" : "neg"}
                      className="font-semibold"
                    />
                  }
                />
              ))}
          </ul>
        </>
      )}

      <SectionTitle>History</SectionTitle>
      <TransactionList
        transactions={txns}
        emptyMessage="Nothing recorded with this person yet."
      />

      <SectionTitle>Manage</SectionTitle>
      <PersonManager
        id={person.id}
        name={person.name}
        phone={person.phone}
        notes={person.notes}
        candidates={candidates}
        canDelete={!usage.hasHistory}
        blockedReason={
          `${person.name} has ${usage.transactions} transaction${usage.transactions === 1 ? "" : "s"} ` +
          `recorded. Deleting them would orphan that history, so merge them into ` +
          `another person instead, or settle up and delete the entries first.`
        }
      />
    </div>
  );
}
