import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AIChannel } from "@prisma/client";

import { getRateLimitForWebhook } from "@/lib/ai/webhook-rate-limit";
import { pairChannelByCode, routeAiMessage } from "@/lib/ai/router";
import { sendTelegramText } from "@/lib/telegram/lead-bot-client";

export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: {
    message_id?: number;
    chat?: {
      id?: number;
      username?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      title?: string | null;
    };
    from?: {
      id?: number;
      username?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    };
    text?: string | null;
  };
};

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function formatDisplayName(update: TelegramUpdate): string | null {
  const from = update.message?.from;
  const firstName = normalizeText(from?.first_name);
  const lastName = normalizeText(from?.last_name);
  const userName = normalizeText(from?.username);

  if (firstName && lastName) return `${firstName} ${lastName}`;
  if (firstName) return firstName;
  if (userName) return `@${userName}`;
  if (update.message?.from?.id) return String(update.message.from.id);
  return null;
}

function formatUsername(update: TelegramUpdate): string | null {
  const from = update.message?.from;
  const parsed = normalizeText(from?.username);
  return parsed ? `@${parsed}` : null;
}

function parsePairCommand(text: string): { isPair: boolean; code: string | null } {
  const match = text.match(/^\/pair\s+([A-Za-z0-9-]+)\s*$/i);
  if (!match) return { isPair: false, code: null };
  return { isPair: true, code: match[1]!.toUpperCase() };
}

function getRequestContext(req: NextRequest) {
  return {
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent"),
  };
}

function verifyWebhookSecret(req: NextRequest): boolean {
  const expected = getEnv("TELEGRAM_WEBHOOK_SECRET");
  if (!expected) return true;
  const provided = req.headers.get("x-telegram-bot-api-secret-token");
  if (!provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rate = getRateLimitForWebhook(req, "telegram");
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

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const chatId = normalizeText(update?.message?.chat?.id ? String(update.message.chat.id) : "");
  const rawText = normalizeText(update?.message?.text ?? null);

  if (!chatId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no_chat_id" });
  }

  if (!rawText) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no_text" });
  }

  const text = rawText;
  const parsedPair = parsePairCommand(text);
  const requestContext = getRequestContext(req);
  const fallbackUpdate = update ?? {};

  let reply = "";

    if (parsedPair.isPair && parsedPair.code) {
      const pairResult = await pairChannelByCode({
        channel: AIChannel.TELEGRAM,
        code: parsedPair.code,
        externalUserId: chatId,
        displayName: formatDisplayName(fallbackUpdate),
        username: formatUsername(fallbackUpdate),
        phoneNumber: null,
      });
    reply = pairResult.message;
  } else {
    const routed = await routeAiMessage({
      channel: AIChannel.TELEGRAM,
      externalUserId: chatId,
      externalThreadId: `telegram-${chatId}`,
      rawText: text,
      requestContext,
    });
    reply = routed.responseText;
  }

  await sendTelegramText(chatId, reply).catch(() => undefined);
  return NextResponse.json({ ok: true, replyTo: chatId, reply, actionStatus: "processed" });
}
