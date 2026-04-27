import "server-only";

type TelegramSendResult =
  | { ok: true; provider: "telegram"; messageId: string | null }
  | { ok: false; provider: "telegram"; error: string };

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

export function isTelegramLeadBotConfigured(): boolean {
  return Boolean(getEnv("TELEGRAM_BOT_TOKEN"));
}

export async function sendTelegramText(chatId: string, message: string): Promise<TelegramSendResult> {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  if (!token) {
    return { ok: false, provider: "telegram", error: "Telegram env not configured." };
  }
  const trimmedChatId = chatId.trim();
  if (!trimmedChatId) {
    return { ok: false, provider: "telegram", error: "Missing chat id." };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: trimmedChatId,
        text: message,
      }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || json?.ok === false) {
      const err = typeof json?.description === "string" ? json.description : `HTTP ${res.status}`;
      return { ok: false, provider: "telegram", error: err };
    }
    const messageId = json?.result?.message_id ? String(json.result.message_id) : null;
    return { ok: true, provider: "telegram", messageId };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, provider: "telegram", error: messageText };
  }
}

export type TelegramFileInfo =
  | { ok: true; fileUrl: string; filePath: string }
  | { ok: false; error: string };

export async function resolveTelegramFileUrl(fileId: string): Promise<TelegramFileInfo> {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  if (!token) return { ok: false, error: "Telegram env not configured." };
  if (!fileId) return { ok: false, error: "Missing file id." };

  const url = `https://api.telegram.org/bot${token}/getFile`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || json?.ok === false) {
      const err = typeof json?.description === "string" ? json.description : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }

    const filePath = typeof json?.result?.file_path === "string" ? (json.result.file_path as string) : "";
    if (!filePath) return { ok: false, error: "Missing file_path" };

    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    return { ok: true, fileUrl, filePath };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: messageText };
  }
}

