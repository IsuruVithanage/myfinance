import Link from "next/link";
import { Plus } from "lucide-react";
import { getAccountsWithBalances, getNetWorth } from "@/lib/queries";
import { BASE_CURRENCY } from "@/lib/money";
import { EmptyState, Money, PageHeader, Row } from "@/components/ui";

export const dynamic = "force-dynamic";

const GROUPS: Array<{ key: string; label: string; types: string[] }> = [
  { key: "spend", label: "Spending", types: ["cash", "wallet", "bank"] },
  { key: "save", label: "Savings", types: ["savings", "investment"] },
  { key: "cards", label: "Cards", types: ["credit_card"] },
  { key: "people", label: "People", types: ["receivable", "payable"] },
];

export default async function AccountsPage() {
  const [accounts, netWorth] = await Promise.all([
    getAccountsWithBalances(),
    getNetWorth(),
  ]);

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={
          <>
            Net worth{" "}
            <Money
              minor={netWorth.totalBase}
              currency={BASE_CURRENCY}
              tone="plain"
              trimZeros
            />
          </>
        }
        action={
          <Link
            href="/accounts/new"
            aria-label="Add an account"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--surface-2)", color: "var(--green)" }}
          >
            <Plus size={20} />
          </Link>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          body="Add your wallet, bank accounts and credit cards to get started."
          action={
            <Link href="/accounts/new" className="btn btn-primary">
              Add an account
            </Link>
          }
        />
      ) : (
        GROUPS.map((g) => {
          const rows = accounts.filter((a) => g.types.includes(a.type));
          if (rows.length === 0) return null;
          return (
            <section key={g.key} className="mb-6">
              <h2 className="eyebrow mb-2.5">{g.label}</h2>
              <ul className="panel">
                {rows.map((a) => (
                  <Row
                    key={a.id}
                    href={`/accounts/${a.id}`}
                    title={a.name}
                    subtitle={
                      [a.institution, a.last4 && `••${a.last4}`, a.currency]
                        .filter(Boolean)
                        .join(" · ")
                    }
                    value={
                      <Money
                        minor={a.balanceMinor}
                        currency={a.currency}
                        tone={
                          a.type === "credit_card" || a.type === "payable"
                            ? "auto"
                            : "plain"
                        }
                        className="font-semibold"
                      />
                    }
                    chevron
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
