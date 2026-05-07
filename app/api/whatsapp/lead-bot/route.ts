import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppDesignBriefLead, type WhatsAppLeadBotInboundMessage } from "@/lib/whatsapp/design-brief-lead-bot";
import { sendWhatsAppText } from "@/lib/whatsapp/lead-bot-client";
import { normalizePhoneNumber } from "@/lib/validation/phone";

export const dynamic = "force-dynamic";

type WhatsAppContact = {
  profile?: {
    name?: string;
  };
  wa_id?: string;
};

type WhatsAppWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: WhatsAppContact[];
        messages?: Array<any>;
      };
    }>;
  }>;
};

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufferA = Buffer.from(a, "hex");
    const bufferB = Buffer.from(b, "hex");
    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}

function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const received = signatureHeader.slice("sha256=".length).trim();
  const computed = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqualHex(computed, received);
}

function findContactName(contacts: WhatsAppContact[] | undefined, from: string): string | null {
  const match = (contacts ?? []).find((contact) => (contact.wa_id ?? "").trim() === from);
  const name = match?.profile?.name?.trim();
  return name || null;
}

function extractInboundMessages(body: WhatsAppWebhookBody): WhatsAppLeadBotInboundMessage[] {
  const results: WhatsAppLeadBotInboundMessage[] = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      const contacts = Array.isArray(change.value?.contacts) ? change.value?.contacts : [];
      const messages = Array.isArray(change.value?.messages) ? change.value?.messages : [];

      for (const message of messages) {
        const from = typeof message?.from === "string" ? message.from.trim() : "";
        if (!from) continue;

        const type = typeof message?.type === "string" ? message.type : "text";
        const contactName = findContactName(contacts, from);
        const text = type === "text" && typeof message?.text?.body === "string" ? message.text.body : null;

        let attachment: WhatsAppLeadBotInboundMessage["attachment"] = null;
        if (type === "image" && typeof message?.image?.id === "string") {
          attachment = {
            fileUrl: `whatsapp://media/${message.image.id}`,
            fileType: typeof message?.image?.mime_type === "string" ? message.image.mime_type : "image",
            originalFileName: null,
          };
        } else if (type === "document" && typeof message?.document?.id === "string") {
          attachment = {
            fileUrl: `whatsapp://media/${message.document.id}`,
            fileType: typeof message?.document?.mime_type === "string" ? message.document.mime_type : "document",
            originalFileName: typeof message?.document?.filename === "string" ? message.document.filename : null,
          };
        }

        if (!text && !attachment) continue;

        results.push({
          externalUserId: from,
          phoneNumber: normalizePhoneNumber(from),
          contactName,
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
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const appSecret = getEnv("WHATSAPP_APP_SECRET");
  const rawBody = await req.text();

  if (appSecret) {
    const valid = verifyWhatsAppSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }
  }

  const parsed = (() => {
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

  for (const message of inbound) {
    const result = await processWhatsAppDesignBriefLead(message);
    await sendWhatsAppText(message.phoneNumber ?? message.externalUserId, result.reply).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, processed: inbound.length });
}
