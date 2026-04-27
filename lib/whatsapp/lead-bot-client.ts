import "server-only";

type WhatsAppSendResult =
  | { ok: true; provider: "meta"; messageId: string | null }
  | { ok: false; provider: "meta"; error: string };

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function normalizeMetaTo(to: string): string | null {
  const raw = to.trim();
  if (!raw) return null;
  const withoutPrefix = raw.toLowerCase().startsWith("whatsapp:") ? raw.slice("whatsapp:".length) : raw;
  const digits = withoutPrefix.replaceAll(/[^\d]/g, "");
  return digits.length >= 8 ? digits : null;
}

export function isWhatsAppLeadBotConfigured(): boolean {
  return Boolean(getEnv("WHATSAPP_PHONE_NUMBER_ID") && getEnv("WHATSAPP_ACCESS_TOKEN"));
}

export async function sendWhatsAppText(to: string, message: string): Promise<WhatsAppSendResult> {
  const phoneNumberId = getEnv("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = getEnv("WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId || !accessToken) {
    return { ok: false, provider: "meta", error: "WhatsApp env not configured." };
  }

  const metaTo = normalizeMetaTo(to);
  if (!metaTo) {
    return { ok: false, provider: "meta", error: "Invalid WhatsApp recipient number." };
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: metaTo,
    type: "text",
    text: { body: message },
  } as const;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      const err = typeof json?.error?.message === "string" ? json.error.message : `HTTP ${res.status}`;
      return { ok: false, provider: "meta", error: err };
    }

    const messageId =
      Array.isArray(json?.messages) && typeof json.messages?.[0]?.id === "string"
        ? (json.messages[0].id as string)
        : null;

    return { ok: true, provider: "meta", messageId };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, provider: "meta", error: messageText };
  }
}

