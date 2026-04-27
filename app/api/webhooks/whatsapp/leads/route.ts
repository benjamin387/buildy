import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { LeadBotChannel } from "@prisma/client";
import { processLeadBotInbound, type InboundLeadBotMessage } from "@/lib/leads/bot-engine";
import { sendWhatsAppText } from "@/lib/whatsapp/lead-bot-client";
import { normalizePhoneNumber } from "@/lib/validation/phone";

export const dynamic = "force-dynamic";

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;
  const received = signatureHeader.slice(expectedPrefix.length).trim();
  const computed = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqualHex(computed, received);
}

type WhatsAppWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<any>;
      };
    }>;
  }>;
};

function extractInboundMessages(body: WhatsAppWebhookBody): InboundLeadBotMessage[] {
  const results: InboundLeadBotMessage[] = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const messages = Array.isArray(change.value?.messages) ? change.value?.messages : [];
      for (const msg of messages) {
        const from = typeof msg?.from === "string" ? msg.from : "";
        if (!from) continue;

        const type = typeof msg?.type === "string" ? msg.type : "text";
        const text = type === "text" && typeof msg?.text?.body === "string" ? (msg.text.body as string) : null;

        let attachment: { fileUrl: string; fileType: string; originalFileName?: string | null } | null = null;
        if (type === "image" && typeof msg?.image?.id === "string") {
          attachment = {
            fileUrl: `whatsapp://media/${msg.image.id}`,
            fileType: typeof msg?.image?.mime_type === "string" ? msg.image.mime_type : "image",
            originalFileName: null,
          };
        } else if (type === "document" && typeof msg?.document?.id === "string") {
          attachment = {
            fileUrl: `whatsapp://media/${msg.document.id}`,
            fileType: typeof msg?.document?.mime_type === "string" ? msg.document.mime_type : "document",
            originalFileName: typeof msg?.document?.filename === "string" ? msg.document.filename : null,
          };
        } else if (type === "video" && typeof msg?.video?.id === "string") {
          attachment = {
            fileUrl: `whatsapp://media/${msg.video.id}`,
            fileType: typeof msg?.video?.mime_type === "string" ? msg.video.mime_type : "video",
            originalFileName: null,
          };
        } else if (type === "audio" && typeof msg?.audio?.id === "string") {
          attachment = {
            fileUrl: `whatsapp://media/${msg.audio.id}`,
            fileType: typeof msg?.audio?.mime_type === "string" ? msg.audio.mime_type : "audio",
            originalFileName: null,
          };
        }

        const phoneNumber = normalizePhoneNumber(from);

        results.push({
          channel: LeadBotChannel.WHATSAPP,
          externalUserId: from,
          phoneNumber,
          telegramChatId: null,
          text,
          attachment,
        });
      }
    }
  }
  return results;
}

export async function GET(req: NextRequest) {
  const verifyToken = getEnv("WHATSAPP_VERIFY_TOKEN");
  if (!verifyToken) {
    return NextResponse.json({ ok: false, error: "Missing WHATSAPP_VERIFY_TOKEN" }, { status: 500 });
  }

  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const appSecret = getEnv("WHATSAPP_APP_SECRET");
  const signature = req.headers.get("x-hub-signature-256");

  const rawBody = await req.text();
  if (appSecret) {
    const ok = verifyWhatsAppSignature(rawBody, signature, appSecret);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }
  }

  const parsed = ((): WhatsAppWebhookBody | null => {
    try {
      return JSON.parse(rawBody) as WhatsAppWebhookBody;
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const inbound = extractInboundMessages(parsed);
  if (inbound.length === 0) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Process sequentially to preserve session ordering.
  for (const msg of inbound) {
    const result = await processLeadBotInbound(msg);
    if (!result.reply) continue;
    // Best-effort send; do not fail webhook processing.
    await sendWhatsAppText(`+${msg.externalUserId.replaceAll(/[^\d]/g, "")}`, result.reply).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, processed: inbound.length });
}

