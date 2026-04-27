export type SendEmailParams = {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html?: string | null;
};

export type SendEmailResult = {
  providerMessageId: string;
};

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { sendEmailMessage } = await import("@/lib/messaging/send-service");
  return sendEmailMessage({
    to: params.to,
    toName: params.toName ?? null,
    subject: params.subject,
    text: params.text,
    html: params.html ?? null,
  });
}
