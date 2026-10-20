import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// icon.svg: the favicon, so the login page has one too. The PWA files too: browsers fetch the
// manifest and icons without cookies (specs/notifications.md).
const PUBLIC = ["/login", "/api/login", "/api/health", "/icon.svg", "/sw.js", "/manifest.webmanifest"];
const PUBLIC_PREFIX = ["/icon/", "/apple-icon"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.includes(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const userId = await verifySession(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (userId !== null) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
