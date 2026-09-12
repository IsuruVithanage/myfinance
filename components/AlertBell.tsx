"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, RefreshCw, X } from "lucide-react";
import type { Notification } from "@/lib/db/schema";
import { dismissAlert, markAlertsRead, refreshAlerts } from "@/lib/actions";
import { Pill } from "@/components/ui";

export default function AlertBell({ alerts }: { alerts: Notification[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const unread = alerts.filter((a) => !a.readAt).length;
  const urgent = alerts.some((a) => a.severity === "urgent");

  function show() {
    setOpen(true);
    if (unread > 0) start(() => void markAlertsRead());
  }

  return (
    <>
      <button
        onClick={show}
        aria-label={`Alerts${unread ? `, ${unread} unread` : ""}`}
        className="relative grid h-11 w-11 place-items-center rounded-full"
        style={{ background: "var(--surface-2)", color: "var(--ash)" }}
      >
        <Bell size={19} />
        {alerts.length > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.65rem] font-bold text-white"
            style={{ background: urgent ? "var(--red)" : "var(--amber)" }}
          >
            {alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: "rgb(0 0 0 / 0.4)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="pop panel w-full max-w-md rounded-b-none sm:rounded-2xl"
            style={{ maxHeight: "82vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderColor: "var(--line)" }}
            >
              <h2 className="font-semibold">Alerts</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => start(() => void refreshAlerts())}
                  disabled={pending}
                  aria-label="Check for new alerts"
                  className="grid h-9 w-9 place-items-center rounded-lg"
                  style={{ color: "var(--ash)" }}
                >
                  <RefreshCw size={16} className={pending ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid h-9 w-9 place-items-center rounded-lg"
                  style={{ color: "var(--ash)" }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div
              className="safe-bottom overflow-y-auto px-2 py-2"
              style={{ maxHeight: "70vh" }}
            >
              {alerts.length === 0 ? (
                <p className="muted px-4 py-10 text-center text-sm">
                  Nothing needs your attention.
                </p>
              ) : (
                <ul className="space-y-1">
                  {alerts.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start gap-3 rounded-xl px-3 py-3"
                      style={{
                        background:
                          a.severity === "urgent"
                            ? "color-mix(in srgb, var(--red) 8%, transparent)"
                            : "transparent",
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Pill
                            tone={a.severity === "urgent" ? "neg" : "warn"}
                          >
                            {a.severity === "urgent" ? "Urgent" : "Soon"}
                          </Pill>
                        </div>
                        <p className="mt-1 text-sm font-semibold">{a.title}</p>
                        <p className="muted text-sm">{a.body}</p>
                        {a.href && (
                          <Link
                            href={a.href}
                            onClick={() => setOpen(false)}
                            className="mt-1 inline-block text-sm font-medium"
                            style={{ color: "var(--green)" }}
                          >
                            Open
                          </Link>
                        )}
                      </div>
                      <button
                        onClick={() => start(() => void dismissAlert(a.id))}
                        aria-label="Dismiss"
                        className="muted grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                      >
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
