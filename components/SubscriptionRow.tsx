import { Repeat } from "lucide-react";
import { BASE_CURRENCY, formatMoney } from "@/lib/money";
import { whenLabel, type SubscriptionView } from "@/lib/subscriptions";
import { IconTile, Money, Row } from "@/components/ui";

const PER: Record<SubscriptionView["cycle"], string> = {
  weekly: "/ wk",
  monthly: "/ mo",
  yearly: "/ yr",
};

/**
 * One subscription: when it next renews or ends, and what it costs.
 * Red within three days, so the ones about to charge stand out at a glance.
 */
export default function SubscriptionRow({ s }: { s: SubscriptionView }) {
  const soon = s.status !== "expired" && s.daysLeft <= 3;

  return (
    <Row
      href={`/subscriptions/${s.id}`}
      chevron
      leading={
        <IconTile
          icon={Repeat}
          shape="circle"
          tone={s.status === "expired" ? "neutral" : soon ? "neg" : "pos"}
        />
      }
      title={
        <span style={{ opacity: s.status === "expired" ? 0.5 : 1 }}>{s.name}</span>
      }
      subtitle={
        <span className={soon ? "neg" : undefined}>
          {whenLabel(s)}
        </span>
      }
      value={
        <span className="font-semibold">
          <Money minor={s.amountMinor} currency={s.currency} tone="plain" trimZeros />
          <span className="muted text-[0.75rem] font-normal"> {PER[s.cycle]}</span>
        </span>
      }
      meta={
        s.currency !== BASE_CURRENCY
          ? `≈ ${formatMoney(s.monthlyBaseMinor, BASE_CURRENCY, { compact: true, trimZeros: true })}/mo`
          : undefined
      }
    />
  );
}
