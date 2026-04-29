import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AIChannel } from "@prisma/client";

import { getRateLimitForWebhook } from "@/lib/ai/webhook-rate-limit";
import { pairChannelByCode, routeAiMessage } from "@/lib/ai/router";
import { sendWhatsAppText } from "@/lib/whatsapp/lead-bot-client";

export const dynamic = "force-dynamic";

type WhatsAppContact = {
  profile?: {
    name?: string;
  };
  wa_id?: string;
};

type WhatsAppMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: {
    body?: string;
  };
};

type WhatsAppWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: {
          phone_number_id?: string;
        };
        contacts?: WhatsAppContact[];
        messages?: WhatsAppMessage[];
      };
    }>;
  }>;
};

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function parsePairCommand(text: string): { isPair: boolean; code: string | null } {
  const match = text.match(/^PAIR\s+([A-Za-z0-9-]+)\s*$/i);
  if (!match) return { isPair: false, code: null };
  return { isPair: true, code: match[1]!.toUpperCase() };
}

function getRequestContext(req: NextRequest) {
  return {
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent"),
  };
}

function toSafeCompare(bufferA: string, bufferB: string): boolean {
  try {
    const a = Buffer.from(bufferA, "utf8");
    const b = Buffer.from(bufferB, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifyWhatsAppSignature(rawBody: string, req: NextRequest, appSecret: string): boolean {
  const signatureHeader = req.headers.get("x-hub-signature-256");
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  return toSafeCompare(expected, received);
}

function extractMessageContactName(contacts: WhatsAppContact[] | undefined, from: string): string | null {
  const match = (contacts || []).find((c) => normalizeText(c.wa_id) === from);
  const name = normalizeText(match?.profile?.name);
  return name || null;
}

function buildIncomingEntries(body: WhatsAppWebhookBody): Array<{ from: string; text: string; contactName: string | null; messageId: string | null }> {
  const results: Array<{ from: string; text: string; contactName: string | null; messageId: string | null }> = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const contacts = entries.length > 0 ? entries[0]?.changes?.[0]?.value?.contacts : [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;
      for (const message of value.messages || []) {
        const from = normalizeText(message.from);
        if (!from) continue;
        if (!message.type || message.type !== "text") continue;
        const text = normalizeText(message.text?.body);
        if (!text) continue;
        results.push({
          from,
          text,
          contactName: extractMessageContactName(contacts, from),
          messageId: normalizeText(message.id),
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

  if (mode === "subscribe" && token && challenge && token === verifyToken) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const rate = getRateLimitForWebhook(req, "whatsapp");
  if (!rate.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests",
        remaining: rate.remaining,
        resetAt: rate.resetAt,
      },
      { status: 429 },
    );
  }

  const rawBody = await req.text();
  const signatureSecret = getEnv("WHATSAPP_APP_SECRET");
  if (signatureSecret) {
    const valid = verifyWhatsAppSignature(rawBody, req, signatureSecret);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }
  }

  const body = ((): WhatsAppWebhookBody | null => {
    try {
      return JSON.parse(rawBody) as WhatsAppWebhookBody;
    } catch {
      return null;
    }
  })();

  if (!body?.entry?.length) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const inbound = buildIncomingEntries(body);
  if (!inbound.length) {
    return NextResponse.json({ ok: true, ignored: true, processed: 0 });
  }

  const requestContext = getRequestContext(req);
  let processed = 0;

  for (const item of inbound) {
    const threadId = item.messageId ? `wa-${item.from}-${item.messageId}` : `wa-${item.from}`;
    const parsedPair = parsePairCommand(item.text);

    let reply = "";
    if (parsedPair.isPair && parsedPair.code) {
      const pairResult = await pairChannelByCode({
        channel: AIChannel.WHATSAPP,
        code: parsedPair.code,
        externalUserId: item.from,
        phoneNumber: item.from,
        displayName: item.contactName,
        username: null,
      });
      reply = pairResult.message;
    } else {
      const routed = await routeAiMessage({
        channel: AIChannel.WHATSAPP,
        externalUserId: item.from,
        externalThreadId: threadId,
        rawText: item.text,
        requestContext,
      });
      reply = routed.responseText;
    }

    processed += 1;
    await sendWhatsAppText(item.from, reply).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, processed });
}
