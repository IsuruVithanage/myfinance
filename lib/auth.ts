import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

/**
 * Single-user app: no user table, no adapter. A JWT session plus a hard
 * allowlist is the whole authorisation model. Anyone not on ALLOWED_EMAILS is
 * rejected at the provider callback, before a session ever exists.
 */
const allowlist = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Local-only shortcut so the app can be run without Google OAuth credentials.
 * Requires BOTH a development build and an explicit opt-in, so it can never
 * exist in a deployed build.
 */
const devLogin =
  process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_LOGIN === "1"
    ? [
        Credentials({
          id: "dev",
          name: "Developer sign-in",
          credentials: {},
          authorize: () => ({
            id: "dev",
            email: allowlist[0] ?? "dev@localhost",
            name: "Dev",
          }),
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, ...devLogin],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    signIn({ account, profile, user }) {
      if (account?.provider === "dev") return devLogin.length > 0;
      const email = (profile?.email ?? user?.email)?.toLowerCase();
      return !!email && allowlist.includes(email);
    },
    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
});
