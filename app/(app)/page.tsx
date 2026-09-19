import Link from "next/link";
import { after } from "next/server";
import {
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ChartPie, PiggyBank, Plus, Receipt, RefreshCw, Users } from "lucide-react";
import {
  getAccountsWithBalances,
  getCardsOverview,
  getCategoryBreakdown,
  getNetWorth,
  getPeriodTotals,
  getTransactions,
} from "@/lib/queries";
import { iso } from "@/lib/cards";
import { currentRateInfo, refreshUsdLkrRate } from "@/lib/fx-feed";
import { BASE_CURRENCY, formatMoney } from "@/lib/money";
import { iconFor, iconForAccountType } from "@/lib/icons";
import {
  Change,
  EmptyState,
  IconTile,
  Money,
  Ring,
  Row,
  SectionTitle,
  StatTile,
} from "@/components/ui";
import TransactionList from "@/components/TransactionList";

export const dynamic = "force-dynamic";

const QUICK_ACTIONS = [
  { href: "/transactions", label: "History", icon: Receipt },
  { href: "/reports", label: "Reports", icon: ChartPie },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/people", label: "People", icon: Users },
];

export default async function DashboardPage() {
  const today = new Date();
  const from = iso(startOfMonth(today));
  const to = iso(endOfMonth(today));
  const lastMonth = subMonths(today, 1);

  /**
   * Fetch the day's rate after the response is sent rather than in front of
   * it: the feeds allow six seconds each before timing out, which is far too
   * long to hold the dashboard for. The first load of a day values balances at
   * yesterday's rate and the next one uses today's — a difference of a
   * fraction of a percent, invisible against a 40-second wait.
   */
  after(() => refreshUsdLkrRate());

  const [netWorth, totals, lastTotals, accounts, cards, topSpend, recent, rate] =
    await Promise.all([
      getNetWorth(),
      getPeriodTotals(from, to),
      getPeriodTotals(iso(startOfMonth(lastMonth)), iso(endOfMonth(lastMonth))),
      getAccountsWithBalances(),
      getCardsOverview(),
      getCategoryBreakdown(from, to, "expense"),
      getTransactions({ limit: 5 }),
      currentRateInfo(),
    ]);

  const spendable = accounts.filter((a) =>
    ["cash", "wallet", "bank", "savings"].includes(a.type),
  );
  const dueSoon = cards
    .filter((c) => !c.settled && c.cycle.daysUntilDue <= 10)
    .sort((a, b) => a.cycle.daysUntilDue - b.cycle.daysUntilDue);

  // How much of this month's income you kept — the ring's single question.
  const savedRatio = totals.income > 0 ? totals.net / totals.income : 0;
  const spendChange =
    lastTotals.expense > 0
      ? (totals.expense - lastTotals.expense) / lastTotals.expense
      : null;

  return (
    <div>
      {/* ── balance + how the month is going ─────────────────────── */}
      <section className="panel px-5 pb-5 pt-5">
        <p className="eyebrow">Balance</p>
        <p className="num mt-1 text-[2.4rem] font-bold leading-none">
          {netWorth.totalBase < 0 && "−"}
          <span className="muted text-[1.35rem] font-semibold">Rs </span>
          {Math.abs(netWorth.totalBase / 100).toLocaleString("en-US", {
            maximumFractionDigits: 0,
          })}
        </p>
        {netWorth.byCurrency.USD !== 0 && (
          <>
            <p className="muted num mt-1.5 text-[0.8rem]">
              LKR{" "}
              {(netWorth.byCurrency.LKR / 100).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
              {"  ·  USD "}
              {(netWorth.byCurrency.USD / 100).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
            </p>

            {/* What the USD figure above was converted at, and how current it
                is — a valuation you cannot see the rate for is not much use. */}
            <Link
              href="/settings"
              className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.72rem]"
              style={{ background: "var(--surface-2)" }}
            >
              <RefreshCw size={11} className="pos" />
              <span className="num">$1 = Rs {rate.rate.toFixed(2)}</span>
              <span className="faint">
                ·{" "}
                {rate.source === "manual"
                  ? "set by you"
                  : rate.date === iso(today)
                    ? "live today"
                    : rate.date}
              </span>
            </Link>
          </>
        )}

        {/* nested card, one step lighter, exactly like a wallet app */}
        <div
          className="mt-4 flex items-center gap-4 rounded-2xl px-4 py-4"
          style={{ background: "var(--surface-2)" }}
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {savedRatio >= 0.2
                ? "Well done"
                : savedRatio > 0
                  ? "Keeping ahead"
                  : "Spending more than you earned"}
            </p>
            <p className="muted mt-1 text-[0.8rem] leading-snug">
              {spendChange == null
                ? `You kept ${formatMoney(totals.net, BASE_CURRENCY, { trimZeros: true })} this month.`
                : spendChange < 0
                  ? `Spending is down ${Math.abs(Math.round(spendChange * 100))}% on ${format(lastMonth, "MMMM")}.`
                  : `Spending is up ${Math.round(spendChange * 100)}% on ${format(lastMonth, "MMMM")}.`}
            </p>
            <Link href="/reports" className="pos mt-2 inline-block text-[0.8rem] font-semibold">
              View details
            </Link>
          </div>

          <Ring
            value={Math.max(0, savedRatio)}
            tone={totals.net < 0 ? "neg" : "pos"}
            size={88}
            thickness={7}
          >
            <span className="num block px-1 text-[0.82rem] font-bold">
              {formatMoney(Math.abs(totals.net), BASE_CURRENCY, {
                compact: true,
                bare: true,
                trimZeros: true,
              })}
            </span>
            <span className="muted mt-0.5 block text-[0.55rem] font-semibold uppercase tracking-wider">
              {totals.net < 0 ? "Over" : "Kept"}
            </span>
          </Ring>
        </div>
      </section>

      {/* ── accounts strip ──────────────────────────────────────── */}
      {spendable.length > 0 && (
        <ul className="hide-scrollbar -mx-4 mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1">
          {spendable.map((a) => (
            <li key={a.id}>
              <StatTile
                icon={iconForAccountType(a.type)}
                label={a.currency}
                value={formatMoney(a.balanceMinor, a.currency, {
                  compact: true,
                  trimZeros: true,
                })}
                href={`/accounts/${a.id}`}
              />
            </li>
          ))}
          <li>
            <Link
              href="/accounts/new"
              className="flex h-full w-[5rem] shrink-0 items-center justify-center rounded-2xl"
              style={{
                border: "1px dashed var(--line)",
                color: "var(--ash-dim)",
              }}
              aria-label="Add an account"
            >
              <Plus size={20} />
            </Link>
          </li>
        </ul>
      )}

      {/* ── quick actions ───────────────────────────────────────── */}
      <ul className="mt-4 flex items-start justify-between gap-2 px-1">
        {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              className="flex flex-col items-center gap-1.5 active:opacity-60"
            >
              <IconTile icon={Icon} shape="circle" size={44} />
              <span className="muted text-[0.7rem] font-medium">{label}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── only when a bill actually needs paying ──────────────── */}
      {dueSoon.length > 0 && (
        <>
          <SectionTitle href="/cards">Due soon</SectionTitle>
          <ul className="panel">
            {dueSoon.map((c) => (
              <Row
                key={c.id}
                href="/cards"
                leading={<IconTile icon={iconForAccountType("credit_card")} tone="neg" />}
                title={c.name}
                subtitle={
                  c.cycle.daysUntilDue < 0
                    ? `${Math.abs(c.cycle.daysUntilDue)} days overdue`
                    : c.cycle.daysUntilDue === 0
                      ? "Due today"
                      : `Due in ${c.cycle.daysUntilDue} days`
                }
                value={
                  <Money
                    minor={c.outstandingMinor}
                    currency={c.currency}
                    tone="neg"
                    className="font-semibold"
                  />
                }
                chevron
              />
            ))}
          </ul>
        </>
      )}

      {/* ── where the money went ────────────────────────────────── */}
      {topSpend.length > 0 && (
        <>
          <SectionTitle href="/reports">
            Top spending · {format(today, "MMMM")}
          </SectionTitle>
          <ul className="panel">
            {topSpend.slice(0, 4).map((c) => (
              <Row
                key={c.categoryId}
                leading={<IconTile icon={iconFor(c.icon)} shape="circle" tone="pos" />}
                title={c.name}
                subtitle={`${c.txnCount} transaction${c.txnCount === 1 ? "" : "s"}`}
                value={
                  <Money
                    minor={c.totalBase}
                    currency={BASE_CURRENCY}
                    tone="plain"
                    trimZeros
                    className="font-semibold"
                  />
                }
                meta={<Change ratio={c.change} />}
              />
            ))}
          </ul>
        </>
      )}

      {spendable.length === 0 && (
        <EmptyState
          title="No accounts yet"
          body="Add your wallet or bank account to start."
          action={
            <Link href="/accounts/new" className="btn btn-primary">
              Add an account
            </Link>
          }
        />
      )}

      {/* ── recent ──────────────────────────────────────────────── */}
      <SectionTitle href="/transactions">Recent</SectionTitle>
      <TransactionList
        transactions={recent}
        emptyMessage="No transactions yet — tap + to add one."
      />
    </div>
  );
}
