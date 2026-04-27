import "server-only";

export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

export type SendResult = { providerMessageId: string };

export type SendEmailMessageParams = {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html?: string | null;
};

export type SendWhatsAppMessageParams = {
  to: string;
  toName?: string | null;
  body: string;
};

export async function sendEmailMessage(params: SendEmailMessageParams): Promise<SendResult> {
  const { sendEmailViaSmtp, isEmailConfigured } = await import("@/lib/messaging/email-provider");
  if (!isEmailConfigured()) {
    throw new ProviderNotConfiguredError(
      "Email provider is not configured. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM.",
    );
  }
  return sendEmailViaSmtp(params);
}

export async function sendWhatsAppMessage(params: SendWhatsAppMessageParams): Promise<SendResult> {
  const { sendWhatsAppText, isWhatsAppConfigured } = await import("@/lib/messaging/whatsapp-provider");
  if (!isWhatsAppConfigured()) {
    throw new ProviderNotConfiguredError(
      "WhatsApp provider is not configured. Set Meta env (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN) or Twilio env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER).",
    );
  }
  return sendWhatsAppText(params);
}
