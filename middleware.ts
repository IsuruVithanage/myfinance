import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Everything behind the passcode, except the unlock screen and static files. */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const unlocked = await verifySessionToken(process.env.AUTH_SECRET, token);
  if (unlocked) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!unlock|api/version|_next/static|_next/image|icons|manifest.webmanifest|sw.js|offline.html|apple-touch-icon.png|favicon.ico).*)",
  ],
};
