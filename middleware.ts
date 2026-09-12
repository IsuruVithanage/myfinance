export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    // everything except the sign-in page, auth endpoints and static assets
    "/((?!signin|api/auth|_next/static|_next/image|icons|manifest.webmanifest|sw.js|favicon.ico).*)",
  ],
};
