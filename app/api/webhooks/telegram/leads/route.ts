import { NextRequest, NextResponse } from "next/server";
import { LeadBotChannel } from "@prisma/client";
import { processLeadBotInbound } from "@/lib/leads/bot-engine";
import { sendTelegramText, resolveTelegramFileUrl } from "@/lib/telegram/lead-bot-client";

export const dynamic = "force-dynamic";

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

type TelegramUpdate = {
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    chat?: { id?: number; type?: string; username?: string };
    from?: { id?: number; username?: string };
    photo?: Array<{ file_id?: string; file_unique_id?: string }>;
    document?: { file_id?: string; file_name?: string; mime_type?: string };
  };
};

export async function POST(req: NextRequest) {
  const secret = getEnv("TELEGRAM_WEBHOOK_SECRET");
  if (secret) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (!header || header !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update?.message?.chat?.id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const chatId = String(update.message.chat.id);
  const text = typeof update.message.text === "string" ? update.message.text : null;

  let attachment: { fileUrl: string; fileType: string; originalFileName?: string | null } | null = null;

  const photoFileId =
    Array.isArray(update.message.photo) && update.message.photo.length > 0
      ? update.message.photo[update.message.photo.length - 1]?.file_id
      : undefined;

  if (photoFileId) {
    const resolved = await resolveTelegramFileUrl(photoFileId);
    attachment = resolved.ok
      ? { fileUrl: resolved.fileUrl, fileType: "photo", originalFileName: null }
      : { fileUrl: `telegram://file/${photoFileId}`, fileType: "photo", originalFileName: null };
  } else if (update.message.document?.file_id) {
    const fileId = update.message.document.file_id;
    const resolved = await resolveTelegramFileUrl(fileId);
    attachment = resolved.ok
      ? {
          fileUrl: resolved.fileUrl,
          fileType: update.message.document.mime_type ?? "document",
          originalFileName: update.message.document.file_name ?? null,
        }
      : {
          fileUrl: `telegram://file/${fileId}`,
          fileType: update.message.document.mime_type ?? "document",
          originalFileName: update.message.document.file_name ?? null,
        };
  }

  const result = await processLeadBotInbound({
    channel: LeadBotChannel.TELEGRAM,
    externalUserId: chatId,
    phoneNumber: null,
    telegramChatId: chatId,
    text,
    attachment,
  });

  await sendTelegramText(chatId, result.reply).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

