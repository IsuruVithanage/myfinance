import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Which commit is actually serving this request.
 *
 * Deliberately public and unauthenticated: its whole job is to answer "is the
 * thing I'm looking at the code I just pushed?" — a question you often need to
 * answer from a browser that is not signed in. It exposes a commit hash and
 * nothing else; no data, no configuration, no secrets.
 */
export async function GET() {
  return NextResponse.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      builtFor: process.env.VERCEL_ENV ?? "development",
      now: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
