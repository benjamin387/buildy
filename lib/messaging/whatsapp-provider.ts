import "server-only";

type MetaWhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
};

function getMetaConfig(): MetaWhatsAppConfig | null {
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

function isTwilioPreferred(): boolean {
  const preferred = (process.env.WHATSAPP_PROVIDER ?? "").trim().toUpperCase();
  return preferred === "TWILIO";
}

function isTwilioEnvConfigured(): boolean {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  // Requirement: Twilio WhatsApp must be configured via these exact env vars (no aliases).
  const from = (process.env.TWILIO_WHATSAPP_NUMBER ?? "").trim();
  return Boolean(accountSid && authToken && from);
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(getMetaConfig() || isTwilioEnvConfigured());
}

function normalizeRecipient(to: string): string {
  // Meta expects MSISDN digits without '+' in many examples; tolerate '+' and spaces.
  return to.replaceAll(/[^\d]/g, "");
}

export async function sendWhatsAppText(params: {
  to: string;
  toName?: string | null;
  body: string;
}): Promise<{ providerMessageId: string }> {
  const metaCfg = getMetaConfig();
  const twilioOk = isTwilioEnvConfigured();

  // Selection rules:
  // 1) If Meta env exists, use Meta first (default).
  // 2) If Meta send fails, fallback to Twilio if configured.
  // 3) If Meta env missing, use Twilio if configured.
  // 4) If WHATSAPP_PROVIDER=TWILIO, Twilio is used first (still will fallback to Meta if Twilio fails and Meta exists).

  async function sendViaTwilio() {
    const { sendTwilioWhatsAppMessage } = await import("@/lib/messaging/whatsapp-twilio");
    console.info("[whatsapp] provider=twilio");
    return sendTwilioWhatsAppMessage(params.to, params.body);
  }

  async function sendViaMeta(cfg: MetaWhatsAppConfig) {
    const to = normalizeRecipient(params.to);
    if (!to) throw new Error("Invalid WhatsApp recipient number.");

    const apiVersion = (process.env.WHATSAPP_API_VERSION ?? "v20.0").trim();
    const url = `https://graph.facebook.com/${apiVersion}/${cfg.phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: params.body },
      }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      const msg = json?.error?.message || `WhatsApp send failed (${res.status})`;
      throw new Error(msg);
    }

    const messageId = json?.messages?.[0]?.id;
    console.info("[whatsapp] provider=meta");
    return { providerMessageId: messageId ? `wa:${messageId}` : `wa:${Date.now().toString(36)}` };
  }

  const preferTwilio = isTwilioPreferred() && twilioOk;
  if (preferTwilio) {
    try {
      return await sendViaTwilio();
    } catch (err) {
      if (!metaCfg) throw err;
      console.warn("[whatsapp] twilio failed, falling back to meta:", err);
      return sendViaMeta(metaCfg);
    }
  }

  if (metaCfg) {
    try {
      return await sendViaMeta(metaCfg);
    } catch (err) {
      if (!twilioOk) throw err;
      console.warn("[whatsapp] meta failed, falling back to twilio:", err);
      return sendViaTwilio();
    }
  }

  if (twilioOk) return sendViaTwilio();
  throw new Error("WhatsApp provider is not configured.");
}
