import "server-only";

type TwilioWhatsAppConfig = {
  accountSid: string;
  authToken: string;
  from: string; // Must be "whatsapp:+65XXXXXXXX"
};

function normalizeWhatsAppMsisdn(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  if (trimmed.startsWith("+")) return `whatsapp:${trimmed.replaceAll(/[^\d+]/g, "")}`;
  // digits only (assume includes country code)
  const digits = trimmed.replaceAll(/[^\d]/g, "");
  return digits ? `whatsapp:+${digits}` : "";
}

function getTwilioConfig(): TwilioWhatsAppConfig | null {
  // Requirement: checks EXACTLY these env vars (no aliases).
  const accountSid = (process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  const fromRaw = (process.env.TWILIO_WHATSAPP_NUMBER ?? "").trim();
  if (!accountSid || !authToken || !fromRaw) return null;

  const from = normalizeWhatsAppMsisdn(fromRaw);
  if (!from || !from.startsWith("whatsapp:+")) return null;

  return { accountSid, authToken, from };
}

export function isTwilioWhatsAppConfigured(): boolean {
  return Boolean(getTwilioConfig());
}

export async function sendTwilioWhatsAppMessage(to: string, message: string): Promise<{ providerMessageId: string }> {
  const cfg = getTwilioConfig();
  if (!cfg) throw new Error("Twilio WhatsApp is not configured.");

  const toNormalized = normalizeWhatsAppMsisdn(to);
  if (!toNormalized || !toNormalized.startsWith("whatsapp:+")) throw new Error("Invalid WhatsApp recipient number.");
  // Requirement: enforce SG format for recipients.
  if (!toNormalized.startsWith("whatsapp:+65")) throw new Error("Twilio WhatsApp recipient must be in SG format: whatsapp:+65XXXXXXXX");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`;
  const body = new URLSearchParams();
  body.set("From", cfg.from);
  body.set("To", toNormalized);
  body.set("Body", message);

  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`, "utf8").toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = json?.message || json?.error_message || `Twilio WhatsApp send failed (${res.status})`;
    throw new Error(msg);
  }

  const sid = json?.sid;
  return { providerMessageId: sid ? `twilio:${sid}` : `twilio:${Date.now().toString(36)}` };
}

// Back-compat alias (older internal calls).
export async function sendWhatsAppMessage(to: string, message: string): Promise<{ providerMessageId: string }> {
  return sendTwilioWhatsAppMessage(to, message);
}
