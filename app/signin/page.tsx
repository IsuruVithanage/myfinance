import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

const devLoginEnabled =
  process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_LOGIN === "1";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm px-6 py-8 text-center">
        <h1 className="title-lg">MyFinance</h1>
        <p className="muted mt-1 text-sm">
          Your accounts, cards, people and spending.
        </p>

        {error && (
          <p
            className="mt-4 rounded-lg px-3 py-2 text-sm"
            style={{
              background: "color-mix(in srgb, var(--red) 12%, transparent)",
              color: "var(--red)",
            }}
          >
            That account isn&apos;t allowed to sign in.
          </p>
        )}

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn btn-primary w-full">Continue with Google</button>
        </form>

        {devLoginEnabled && (
          <form
            className="mt-3"
            action={async () => {
              "use server";
              await signIn("dev", { redirectTo: "/" });
            }}
          >
            <button className="btn btn-ghost w-full">
              Developer sign-in (local only)
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
