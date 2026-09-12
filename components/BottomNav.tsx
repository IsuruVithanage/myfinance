"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartPie, CreditCard, House, Plus, Users, Wallet } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/add", label: "Add", icon: Plus, primary: true },
  { href: "/cards", label: "Cards", icon: CreditCard },
  { href: "/people", label: "People", icon: Users },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  // The add screen ends in a keypad + Save; two bars would fight for the
  // same thumb zone, so the nav steps aside there.
  if (pathname === "/add") return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{
        background: "color-mix(in srgb, var(--black) 82%, transparent)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="mx-auto flex max-w-lg items-center justify-around px-1">
        {TABS.map(({ href, label, icon: Icon, ...rest }) => {
          const primary = "primary" in rest && rest.primary;
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          if (primary) {
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label="Add transaction"
                  className="grid h-12 w-12 place-items-center active:scale-95"
                  style={{
                    background: "var(--green)",
                    color: "#000",
                    borderRadius: "9999px",
                    transition: "transform .08s ease",
                  }}
                >
                  <Plus size={24} strokeWidth={2.6} />
                </Link>
              </li>
            );
          }

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium"
                style={{ color: active ? "var(--green)" : "var(--ash-dim)" }}
              >
                <Icon size={21} strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop gets a sidebar instead of a thumb bar. */
export function SideNav() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Home", icon: House },
    { href: "/add", label: "Add", icon: Plus },
    { href: "/accounts", label: "Accounts", icon: Wallet },
    { href: "/cards", label: "Cards", icon: CreditCard },
    { href: "/people", label: "People", icon: Users },
    { href: "/reports", label: "Reports", icon: ChartPie },
  ];

  return (
    <aside
      className="hidden w-56 shrink-0 p-3 md:block"
      style={{ borderRight: "1px solid var(--line)" }}
    >
      <div className="px-3 pb-5 pt-3 text-lg font-bold tracking-tight">
        MyFinance
      </div>
      <ul className="space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
                style={{
                  background: active ? "var(--surface-2)" : "transparent",
                  color: active ? "var(--green)" : "var(--ash)",
                }}
              >
                <Icon size={18} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
