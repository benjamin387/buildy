import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.has("app_session");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPrefixes = [
    "/dashboard",
    "/projects",
    "/quotation",
    "/quotations",
    "/contracts",
    "/invoices",
    "/suppliers",
    "/vendors",
    "/settings",
  ];

  if (!protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (hasSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  loginUrl.searchParams.set(
    "callbackUrl",
    callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/projects",
  );

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/projects/:path*",
    "/dashboard/:path*",
    "/quotation/:path*",
    "/quotations/:path*",
    "/contracts/:path*",
    "/invoices/:path*",
    "/suppliers/:path*",
    "/vendors/:path*",
    "/settings/:path*",
  ],
};
