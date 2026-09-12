import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import {
  SESSION_COOKIE,
  constantTimeEqual,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const jar = await cookies();
  if (await verifySessionToken(process.env.AUTH_SECRET, jar.get(SESSION_COOKIE)?.value)) {
    redirect("/");
  }

  const { e } = await searchParams;
  const configured = Boolean(process.env.APP_PASSCODE && process.env.AUTH_SECRET);

  async function unlock(formData: FormData) {
    "use server";

    const expected = process.env.APP_PASSCODE;
    const secret = process.env.AUTH_SECRET;
    // Fail closed: a missing passcode locks the app rather than opening it.
    if (!expected || !secret) redirect("/unlock?e=config");

    const entered = String(formData.get("passcode") ?? "");
    if (!constantTimeEqual(entered, expected)) {
      // Slow brute force to a crawl without needing any shared state.
      await new Promise((r) => setTimeout(r, 700));
      redirect("/unlock?e=1");
    }

    const jar = await cookies();
    jar.set(SESSION_COOKIE, await createSessionToken(secret), sessionCookieOptions());
    redirect("/");
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm text-center">
        <span
          className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: "var(--surface-2)", color: "var(--green)" }}
        >
          <Lock size={24} />
        </span>

        <h1 className="title-lg">MyFinance</h1>
        <p className="muted mt-2 text-sm">
          Enter your passcode. This device stays unlocked afterwards.
        </p>

        {e === "config" ? (
          <p
            className="mt-5 rounded-xl px-3 py-3 text-sm"
            style={{
              background: "color-mix(in srgb, var(--red) 12%, transparent)",
              color: "var(--red)",
            }}
          >
            <strong>APP_PASSCODE</strong> and <strong>AUTH_SECRET</strong> are not
            set on the server, so the app has locked itself. Set them and redeploy.
          </p>
        ) : (
          <form action={unlock} className="mt-6 space-y-3">
            <input
              name="passcode"
              type="password"
              inputMode="text"
              autoComplete="current-password"
              autoFocus
              required
              aria-label="Passcode"
              placeholder="Passcode"
              className="field text-center"
              style={{ letterSpacing: "0.1em" }}
            />
            {e === "1" && (
              <p className="neg text-sm" role="alert">
                That passcode is not right.
              </p>
            )}
            <button className="btn btn-primary w-full" disabled={!configured}>
              Unlock
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
