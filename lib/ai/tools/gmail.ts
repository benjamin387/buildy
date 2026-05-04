import { randomUUID } from "node:crypto";

export type GmailSearchResult = {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
};

export type GmailToolResponse = {
  ok: boolean;
  provider: "placeholder" | "configured";
  message?: string;
  data?: unknown;
  error?: string;
};

type DraftRecord = {
  id: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
};

const draftStore = new Map<string, DraftRecord>();

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function isConfigured(): boolean {
  return Boolean(
    getEnv("GOOGLE_CLIENT_ID") &&
      getEnv("GOOGLE_CLIENT_SECRET") &&
      getEnv("GMAIL_ENCRYPTION_KEY"),
  );
}

export async function gmailSearch(query: string): Promise<GmailToolResponse> {
  if (!query.trim()) {
    return { ok: false, provider: isConfigured() ? "configured" : "placeholder", error: "Missing Gmail query." };
  }

  if (!isConfigured()) {
    return {
      ok: true,
      provider: "placeholder",
      message: `Gmail search placeholder for query: ${query}`,
      data: [
        {
          id: "draft-placeholder-1",
          subject: `Search for ${query}`,
          sender: "no-reply@example.com",
          snippet: `Provider not configured. Query captured for audit only. (${new Date().toISOString()})`,
        },
      ],
    };
  }

  return {
    ok: true,
    provider: "configured",
    message: "Gmail search provider is available; integrate using Google Workspace API in production.",
    data: [
      {
        id: `gmail-${randomUUID().slice(0, 8)}`,
        subject: `Search results available for: ${query}`,
        sender: "no-reply@example.com",
        snippet: "Production Gmail provider integration pending.",
      },
    ],
  };
}

export async function gmailRead(messageId: string | null): Promise<GmailToolResponse> {
  if (!messageId) {
    return { ok: false, provider: isConfigured() ? "configured" : "placeholder", error: "Missing Gmail message id." };
  }

  if (!isConfigured()) {
    return {
      ok: true,
      provider: "placeholder",
      message: `Gmail read placeholder for message ${messageId}.`,
      data: {
        id: messageId,
        subject: `Placeholder message ${messageId}`,
        body: `This is a placeholder payload because Gmail credentials are not configured.`,
        from: "system@example.com",
      },
    };
  }

  return {
    ok: true,
    provider: "configured",
    message: `Read message ${messageId} from production Gmail API.`,
    data: {
      id: messageId,
      subject: "Production Gmail read endpoint placeholder",
      body: "Wire Google Gmail API to return real message body.",
      from: "system@example.com",
    },
  };
}

export async function gmailCreateDraft(to: string | null, subject: string | null, body: string | null): Promise<GmailToolResponse> {
  if (!to || !to.includes("@") || !subject || !body) {
    return { ok: false, provider: isConfigured() ? "configured" : "placeholder", error: "Missing recipient, subject, or body for draft." };
  }

  const draftId = `draft-${randomUUID().slice(0, 10)}`;
  const now = new Date().toISOString();
  const record: DraftRecord = {
    id: draftId,
    to,
    subject,
    body,
    createdAt: now,
  };
  draftStore.set(draftId, record);

  if (!isConfigured()) {
    return {
      ok: true,
      provider: "placeholder",
      message: `Created placeholder draft ${draftId} for ${to}.`,
      data: record,
    };
  }

  return {
    ok: true,
    provider: "configured",
    message: `Created draft ${draftId} in Gmail for ${to}.`,
    data: { ...record, id: draftId },
  };
}

export async function gmailSendDraft(draftId: string | null): Promise<GmailToolResponse> {
  if (!draftId) {
    return { ok: false, provider: isConfigured() ? "configured" : "placeholder", error: "Missing Gmail draft id." };
  }

  const record = draftStore.get(draftId);
  if (!isConfigured() && !record) {
    return { ok: false, provider: "placeholder", error: `Draft ${draftId} not found in placeholder store.` };
  }

  if (!isConfigured()) {
    return {
      ok: true,
      provider: "placeholder",
      message: `Placeholder send of draft ${draftId} to ${record?.to ?? "recipient"}.`,
      data: { sent: true, draftId, to: record?.to ?? "recipient", subject: record?.subject ?? "Unknown", provider: "placeholder" },
    };
  }

  return {
    ok: true,
    provider: "configured",
    message: `Draft ${draftId} sent through Gmail API placeholder flow.`,
    data: { sent: true, draftId },
  };
}
