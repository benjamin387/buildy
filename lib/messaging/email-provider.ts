import "server-only";

import nodemailer from "nodemailer";
import { getNotificationSetting } from "@/lib/settings/service";

type EmailConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

function getEmailConfig(): EmailConfig | null {
  const host = (process.env.EMAIL_HOST ?? process.env.SMTP_HOST ?? "").trim();
  const portRaw = (process.env.EMAIL_PORT ?? process.env.SMTP_PORT ?? "").trim();
  const user = (process.env.EMAIL_USER ?? process.env.SMTP_USER ?? "").trim();
  const password = (process.env.EMAIL_PASSWORD ?? process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? "").trim();
  const from = (process.env.EMAIL_FROM ?? "").trim() || user;

  const port = Number(portRaw);
  if (!host || !Number.isFinite(port) || port <= 0 || !user || !password || !from) return null;

  return { host, port, user, password, from };
}

export function isEmailConfigured(): boolean {
  return Boolean(getEmailConfig());
}

let cachedTransport: nodemailer.Transporter | null = null;
let cachedKey: string | null = null;

function getTransport() {
  const cfg = getEmailConfig();
  if (!cfg) {
    throw new Error("Email provider is not configured.");
  }

  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.from}`;
  if (cachedTransport && cachedKey === key) return cachedTransport;

  const secure = cfg.port === 465;
  cachedTransport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure,
    auth: { user: cfg.user, pass: cfg.password },
  });
  cachedKey = key;
  return cachedTransport;
}

export async function sendEmailViaSmtp(params: {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html?: string | null;
}): Promise<{ providerMessageId: string }> {
  const cfg = getEmailConfig();
  if (!cfg) throw new Error("Email provider is not configured.");

  const transport = getTransport();

  const to = params.to.trim();
  let fromAddress = cfg.from;
  let fromName = process.env.EMAIL_FROM_NAME?.trim() || null;
  let replyTo: string | null = null;
  try {
    const notification = await getNotificationSetting();
    if (notification.emailFromAddress?.trim()) {
      fromAddress = notification.emailFromAddress.trim();
    }
    if (notification.emailFromName?.trim()) {
      fromName = notification.emailFromName.trim();
    }
    if (notification.defaultReplyToEmail?.trim()) {
      replyTo = notification.defaultReplyToEmail.trim();
    }
  } catch {
    // fail-soft
  }

  const formattedFrom = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

  const info = await transport.sendMail({
    from: formattedFrom,
    to: params.toName ? `${params.toName} <${to}>` : to,
    subject: params.subject,
    text: params.text,
    html: params.html ?? undefined,
    replyTo: replyTo ?? undefined,
  });

  return { providerMessageId: info.messageId || `smtp:${Date.now().toString(36)}` };
}
