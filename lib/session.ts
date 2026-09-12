/**
 * The whole authentication model: one passcode, one signed cookie.
 *
 * There is no user table, no OAuth provider and no account system, because
 * exactly one person uses this app. What the cookie proves is simply "whoever
 * holds this knew the passcode", which is all the app needs to decide.
 *
 * Written against Web Crypto so the same code runs in middleware (Edge) and in
 * server actions (Node).
 */

export const SESSION_COOKIE = "myfinance_session";

/** A year. You unlock a device once and then forget this exists. */
export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compare without leaking where two strings diverge. Always walks the full
 * length of the longer string.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** `<expiresAt>.<signature>` — self-contained, so nothing is stored server-side. */
export async function createSessionToken(secret: string): Promise<string> {
  const expires = String(Date.now() + SESSION_TTL_MS);
  return `${expires}.${await sign(secret, expires)}`;
}

export async function verifySessionToken(
  secret: string | undefined,
  token: string | undefined,
): Promise<boolean> {
  if (!secret || !token) return false;

  const dot = token.indexOf(".");
  if (dot < 1) return false;

  const expires = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  return constantTimeEqual(signature, await sign(secret, expires));
}

/** Shared cookie options, so the session is written the same way everywhere. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
