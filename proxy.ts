import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.has("app_session");
}

const OPEN_AI_WEBHOOK_PREFIXES = [
  "/api/ai/channels/telegram",
  "/api/ai/channels/telegram/webhook",
  "/api/ai/channels/whatsapp",
  "/api/ai/channels/whatsapp/webhook",
  "/api/webhooks/telegram",
  "/api/webhooks/whatsapp",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (OPEN_AI_WEBHOOK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

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
    "/api/ai/channels/:path*",
  ],
};
