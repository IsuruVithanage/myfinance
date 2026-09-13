import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";
import { getNotifications } from "@/lib/queries";
import { refreshNotifications } from "@/lib/notifications";
import BottomNav, { SideNav } from "@/components/BottomNav";
import AlertBell from "@/components/AlertBell";

/**
 * Every screen behind the passcode is per-request: it reads the session cookie
 * and live balances. Marking the shell dynamic keeps any of them from being
 * prerendered or cached — financial figures should never be served from a
 * build-time snapshot.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await refreshNotifications();
  const alerts = await getNotifications();

  return (
    <div className="flex min-h-dvh">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="safe-top sticky top-0 z-30 flex items-center justify-between gap-2 px-4 pb-2 pt-3 md:px-6"
          style={{
            background: "color-mix(in srgb, var(--black) 80%, transparent)",
            backdropFilter: "blur(20px)",
          }}
        >
          <Link href="/" className="text-base font-bold tracking-tight md:hidden">
            MyFinance
          </Link>
          <span className="hidden md:block" />
          <div className="flex items-center gap-2">
            <AlertBell alerts={alerts} />
            <Link
              href="/settings"
              aria-label="Settings"
              className="grid h-10 w-10 place-items-center rounded-full"
              style={{ background: "var(--surface-2)", color: "var(--ash)" }}
            >
              <SettingsIcon size={18} />
            </Link>
          </div>
        </header>

        <main className="page mx-auto w-full max-w-2xl flex-1 px-4 md:max-w-4xl md:px-6">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
