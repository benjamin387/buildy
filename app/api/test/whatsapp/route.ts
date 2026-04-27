import { NextRequest, NextResponse } from "next/server";
import { sendTwilioWhatsAppMessage } from "@/lib/messaging/whatsapp-twilio";

export const dynamic = "force-dynamic";

function envPresent(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim());
}

function validateBearerCronSecret(req: NextRequest): { ok: true } | { ok: false; status: 401 | 500 } {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) return { ok: false, status: 500 };

  const auth = (req.headers.get("authorization") ?? "").trim();
  const prefix = "Bearer ";
  const provided = auth.startsWith(prefix) ? auth.slice(prefix.length).trim() : "";
  if (!provided || provided !== expected) return { ok: false, status: 401 };

  return { ok: true };
}

async function handle(req: NextRequest) {
  const auth = validateBearerCronSecret(req);
  if (!auth.ok) {
    if (auth.status === 500) {
      return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
    }
    return NextResponse.json(
      { ok: false, error: "Unauthorized", expectedEnv: "CRON_SECRET" },
      { status: 401 },
    );
  }

  const hasSid = envPresent("TWILIO_ACCOUNT_SID");
  const hasToken = envPresent("TWILIO_AUTH_TOKEN");
  const hasFrom = envPresent("TWILIO_WHATSAPP_NUMBER");
  const hasTo = envPresent("WHATSAPP_TEST_TO");

  if (!hasSid || !hasToken || !hasFrom || !hasTo) {
    return NextResponse.json(
      {
        ok: false,
        error: "Twilio WhatsApp is not configured.",
        hasSid,
        hasToken,
        hasFrom,
        hasTo,
      },
      { status: 500 },
    );
  }

  const to = (process.env.WHATSAPP_TEST_TO ?? "").trim();
  try {
    const result = await sendTwilioWhatsAppMessage(to, "Buildy AI system is live 🚀");
    const sid = result.providerMessageId.startsWith("twilio:") ? result.providerMessageId.slice("twilio:".length) : result.providerMessageId;
    return NextResponse.json({ ok: true, provider: "twilio", sid });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    // If Twilio config is missing (or invalid format), return env presence only.
    if (errorMessage.includes("Twilio WhatsApp is not configured")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Twilio WhatsApp is not configured.",
          hasSid,
          hasToken,
          hasFrom,
          hasTo,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
