import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session";
import { Download, Lock } from "lucide-react";
import { getCategories, getSettings } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { CategoryManager, RateForm } from "@/components/SettingsForms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, categories] = await Promise.all([
    getSettings(),
    getCategories(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />

      <RateForm current={Number(settings.fallbackUsdLkr)} />

      <CategoryManager
        categories={categories
          .filter((c) => !c.archivedAt)
          .map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            color: c.color,
            icon: c.icon,
            isSystem: c.isSystem,
          }))}
      />


      <div className="panel px-4 py-4">
        <h2 className="font-semibold">Your data</h2>
        <p className="muted mt-0.5 text-sm">
          A full copy of every account, category and transaction. Keep one
          somewhere safe.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <a href="/api/export?format=json" className="btn btn-ghost flex-1">
            <Download size={16} /> JSON backup
          </a>
          <a href="/api/export?format=csv" className="btn btn-ghost flex-1">
            <Download size={16} /> CSV of transactions
          </a>
        </div>
      </div>

      <div className="panel px-4 py-4">
        <h2 className="font-semibold">Accounts &amp; people</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Link href="/accounts" className="btn btn-ghost flex-1">
            Manage accounts
          </Link>
          <Link href="/people" className="btn btn-ghost flex-1">
            Manage people
          </Link>
          <Link href="/budgets" className="btn btn-ghost flex-1">
            Budgets
          </Link>
        </div>
      </div>

      <form
        action={async () => {
          "use server";
          const jar = await cookies();
          jar.delete(SESSION_COOKIE);
          redirect("/unlock");
        }}
      >
        <button className="btn btn-ghost w-full" style={{ color: "var(--red)" }}>
          <Lock size={16} /> Lock this device
        </button>
      </form>
    </div>
  );
}
