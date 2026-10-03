import { NextRequest, NextResponse } from "next/server";

const AUTH_ROUTES = ["/login", "/register"];
const APP_PREFIXES = ["/org", "/invite", "/settings", "/billing"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get("tf_session")?.value);

  if (!hasSession && APP_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (hasSession && AUTH_ROUTES.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/org";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
