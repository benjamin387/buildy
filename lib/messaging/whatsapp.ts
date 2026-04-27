export type SendWhatsAppParams = {
  to: string;
  toName?: string | null;
  body: string;
};

export type SendWhatsAppResult = {
  providerMessageId: string;
};

export async function sendWhatsApp(params: SendWhatsAppParams): Promise<SendWhatsAppResult> {
  const { sendWhatsAppMessage } = await import("@/lib/messaging/send-service");
  return sendWhatsAppMessage({
    to: params.to,
    toName: params.toName ?? null,
    body: params.body,
  });
}
