import Link from "next/link";
import { Plus } from "lucide-react";
import { getSubscriptions } from "@/lib/subscriptions";
import { BASE_CURRENCY, formatMoney } from "@/lib/money";
import { EmptyState, Money, PageHeader } from "@/components/ui";
import SubscriptionRow from "@/components/SubscriptionRow";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const { items, activeCount, monthlyTotalBase } = await getSubscriptions();

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle="What renews, when, and what it costs."
        action={
          <Link
            href="/subscriptions/new"
            aria-label="Add subscription"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--green)", color: "#000" }}
          >
            <Plus size={20} />
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No subscriptions yet"
          body="Add Netflix, iCloud, a gym — anything that renews — and the dashboard will show what's coming up."
          action={
            <Link href="/subscriptions/new" className="btn btn-primary">
              Add subscription
            </Link>
          }
        />
      ) : (
        <>
          <section className="panel px-5 py-5">
            <p className="eyebrow">Every month</p>
            <Money
              minor={monthlyTotalBase}
              currency={BASE_CURRENCY}
              tone="plain"
              trimZeros
              className="mt-1.5 block text-[2.25rem] font-bold leading-none"
            />
            <p className="muted mt-2 text-[0.8rem]">
              {activeCount} active ·{" "}
              {formatMoney(monthlyTotalBase * 12, BASE_CURRENCY, {
                compact: true,
                trimZeros: true,
              })}{" "}
              a year. Yearly and weekly plans are spread per month; USD at
              today&apos;s rate.
            </p>
          </section>

          <ul className="panel mt-3">
            {items.map((s) => (
              <SubscriptionRow key={s.id} s={s} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
