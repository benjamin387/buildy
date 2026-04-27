import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getVerifyToken(): string | null {
  const v = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  return v ? v : null;
}

export async function GET(req: NextRequest) {
  // Meta webhook verification:
  // https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge) {
    const expected = getVerifyToken();
    if (expected && token === expected) {
      return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return NextResponse.json({ ok: false, error: "Invalid verify token" }, { status: 403 });
  }

  return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  // Placeholder: receive inbound status/events and later map to delivery/viewed updates.
  // IMPORTANT: Do not log access tokens. We only log high-level event type.
  try {
    const body = await req.json();
    const object = typeof body?.object === "string" ? body.object : "unknown";
    // eslint-disable-next-line no-console
    console.log("[whatsapp-webhook]", { object });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

