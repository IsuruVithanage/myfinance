import Link from "next/link";
import { Plus } from "lucide-react";
import { getPeopleOverview, getTransactions } from "@/lib/queries";
import { BASE_CURRENCY } from "@/lib/money";
import {
  EmptyState,
  Money,
  PageHeader,
  Row,
  SectionTitle,
} from "@/components/ui";
import TransactionList from "@/components/TransactionList";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const [people, recent] = await Promise.all([
    getPeopleOverview(),
    getTransactions({ limit: 30 }),
  ]);

  const peopleTxns = recent.filter((t) =>
    ["lend", "collect", "borrow", "settle"].includes(t.type),
  );

  const owedToMe = people.reduce((s, p) => s + p.owedToYouBase, 0);
  const iOwe = people.reduce((s, p) => s + p.youOweBase, 0);

  return (
    <div>
      <PageHeader
        title="People"
        action={
          <Link
            href="/people/new"
            aria-label="Add a person"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--surface-2)", color: "var(--green)" }}
          >
            <Plus size={20} />
          </Link>
        }
      />

      {/* two plain numbers, same treatment as the dashboard */}
      <section className="flex gap-10 pb-1">
        <div>
          <p className="eyebrow">Owed to me</p>
          <Money
            minor={owedToMe}
            currency={BASE_CURRENCY}
            tone="pos"
            trimZeros
            className="mt-1 block text-xl font-semibold"
          />
        </div>
        <div>
          <p className="eyebrow">I owe</p>
          <Money
            minor={iOwe}
            currency={BASE_CURRENCY}
            tone="neg"
            trimZeros
            className="mt-1 block text-xl font-semibold"
          />
        </div>
      </section>

      {people.length === 0 ? (
        <EmptyState
          title="Nobody tracked yet"
          body="Add a person, then use Lent out or Borrowed on the add screen."
          action={
            <Link href="/people/new" className="btn btn-primary">
              Add a person
            </Link>
          }
        />
      ) : (
        <>
          <SectionTitle>Balances</SectionTitle>
          <ul className="panel">
            {people.map((p) => (
              <Row
                key={p.person.id}
                title={p.person.name}
                subtitle={
                  p.netBase > 0
                    ? "owes you"
                    : p.netBase < 0
                      ? "you owe them"
                      : "all square"
                }
                value={
                  <Money
                    minor={Math.abs(p.netBase)}
                    currency={BASE_CURRENCY}
                    tone={
                      p.netBase > 0 ? "pos" : p.netBase < 0 ? "neg" : "muted"
                    }
                    className="font-semibold"
                  />
                }
                meta={
                  p.ledgers.filter((l) => l.balanceMinor !== 0).length > 1
                    ? "multiple currencies"
                    : undefined
                }
              />
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Activity</SectionTitle>
      <TransactionList
        transactions={peopleTxns}
        emptyMessage="No lending or borrowing recorded yet."
      />
    </div>
  );
}
