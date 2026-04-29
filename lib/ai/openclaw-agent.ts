import { AiTool, AiMessageRole } from "@prisma/client";

export type OpenClawToolInput = {
  [key: string]: unknown;
};

export type OpenClawIntent =
  | {
      mode: "tool";
      tool: AiTool;
      actionType: string;
      input: OpenClawToolInput;
      confidence: number;
      summary: string;
    }
  | {
      mode: "chat";
      chatResponse: string;
      confidence: number;
      summary: string;
    };

type OpenClawClassifierResponse = {
  mode: "tool" | "chat";
  tool?: AiTool;
  actionType?: string;
  input?: OpenClawToolInput;
  chatResponse?: string;
  confidence?: number;
  summary?: string;
};

const OPENAI_TIMEOUT_MS = 7000;

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function parseTextIntent(message: string): OpenClawIntent {
  const normalized = message.trim();
  const lowered = normalized.toLowerCase();

  if (!normalized) {
    return {
      mode: "chat",
      chatResponse:
        "I can help with web search, Gmail, or calendar actions once you send a specific command. Example: 'search web for interior design trends'",
      confidence: 0.95,
      summary: "Empty input received",
    };
  }

  const calendarCreatePatterns = [
    /create\s+(?:an?\s+)?calendar\s+(?:event|meeting)|schedule\s+(?:an?\s+)?event|book\s+(?:a\s+)?meeting/i,
    /add\s+(?:an?\s+)?event/i,
    /calendar:\s*create/i,
  ];
  if (calendarCreatePatterns.some((rx) => rx.test(normalized))) {
    const titleMatch =
      normalized.match(/title\s*[:\-]\s*([\w\s'-]+?)(?:\s+(?:at|on|from|between|next|tomorrow|today|\.|$))/i) ??
      normalized.match(/"([^"]+)"/);
    const whenMatch =
      normalized.match(/(?:at|on)\s+([^]+)$/i) ||
      normalized.match(/tomorrow|today|next\s+\w+|\b\d{1,2}:\d{2}\b/i);

    return {
      mode: "tool",
      tool: AiTool.CALENDAR_WRITE,
      actionType: "calendar_create_event",
      confidence: 0.82,
      summary: "Create calendar event request",
      input: {
        title: titleMatch?.[1]?.trim() || "Meeting event",
        when: whenMatch ? whenMatch[0].trim() : null,
        rawInput: normalized,
      },
    };
  }

  const calendarReadPatterns = [/calendar\s*(?:events)?\s*(?:for|on|today|tomorrow|next|this|for week)?/i, /what\s+are\s+(?:my\s+)?upcoming\s+events?/i];
  if (calendarReadPatterns.some((rx) => rx.test(normalized))) {
    return {
      mode: "tool",
      tool: AiTool.CALENDAR_READ,
      actionType: "calendar_search",
      confidence: 0.74,
      summary: "Search calendar",
      input: {
        query: normalized,
      },
    };
  }

  const gmailReadPatterns = [/read\s+gmail\s+(?:message\s+)?#?\w+/i, /gmail\s+read/i, /open\s+gmail\s+message/i];
  if (gmailReadPatterns.some((rx) => rx.test(normalized))) {
    const messageId =
      normalized.match(/#(\w+)/)?.[1] ||
      normalized.match(/id\s*[:#]?\s*([a-z0-9-]+)/i)?.[1] ||
      null;
    return {
      mode: "tool",
      tool: AiTool.GMAIL_READ,
      actionType: "gmail_read",
      confidence: 0.74,
      summary: "Read gmail message",
      input: {
        messageId,
      },
    };
  }

  const gmailDraftPatterns = [/draft\s+(?:an?|to)\s+gmail|create\s+(?:an?|a)\s+gmail\s+draft|compose\s+(?:an?|a)\s+draft/i];
  if (gmailDraftPatterns.some((rx) => rx.test(normalized))) {
    const to =
      normalized.match(/to\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})/i)?.[1] ||
      normalized.match(/send\s+to\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})/i)?.[1] ||
      null;
    const subject =
      normalized.match(/subject\s*[:\-]\s*([^\n.]+)/i)?.[1]?.trim() ||
      normalized.match(/subj\s*[:\-]\s*([^\n.]+)/i)?.[1]?.trim() ||
      null;
    const body = normalized.match(/body\s*[:\-]\s*([\s\S]+)/i)?.[1]?.trim() || null;
    return {
      mode: "tool",
      tool: AiTool.GMAIL_DRAFT,
      actionType: "gmail_create_draft",
      confidence: 0.78,
      summary: "Create Gmail draft",
      input: { to, subject, body, rawInput: normalized },
    };
  }

  const gmailSendPatterns = [/send\s+(?:gmail\s+)?draft|send\s+draft/i];
  if (gmailSendPatterns.some((rx) => rx.test(normalized))) {
    const draftId =
      normalized.match(/draft\s+([\w-]+)/i)?.[1] ||
      normalized.match(/id\s*[:\-]?\s*([\w-]+)/i)?.[1] ||
      null;
    return {
      mode: "tool",
      tool: AiTool.GMAIL_SEND,
      actionType: "gmail_send_draft",
      confidence: 0.84,
      summary: "Send Gmail draft",
      input: { draftId },
    };
  }

  const webSearchPatterns = [/search\s+web|web\s+search|search\s+for|find\s+for/i];
  if (webSearchPatterns.some((rx) => rx.test(normalized))) {
    const query = normalized.replace(/^(search\s+web\s*for|web\s+search\s*for|search\s+for|find)\s*/i, "");
    return {
      mode: "tool",
      tool: AiTool.WEB_SEARCH,
      actionType: "web_search",
      confidence: 0.88,
      summary: "Web search request",
      input: {
        query: query.trim() || normalized,
      },
    };
  }

  const fallbackGmailSearch = /gmail\s+search|search\s+my\s+gmail|in\s+gmail/i;
  if (fallbackGmailSearch.test(normalized)) {
    return {
      mode: "tool",
      tool: AiTool.GMAIL_READ,
      actionType: "gmail_search",
      confidence: 0.71,
      summary: "Search Gmail messages",
      input: { query: normalized.replace(/gmail\s*/i, "").trim() },
    };
  }

  const calendarUpdatePatterns = [/update\s+(?:an?)?\s*calendar\s+event|reschedule|move\s+event/i];
  if (calendarUpdatePatterns.some((rx) => rx.test(normalized))) {
    const eventId =
      normalized.match(/event\s+([\w-]+)/i)?.[1] ||
      normalized.match(/id\s*[:\-]?\s*([\w-]+)/i)?.[1] ||
      null;
    return {
      mode: "tool",
      tool: AiTool.CALENDAR_WRITE,
      actionType: "calendar_update_event",
      confidence: 0.77,
      summary: "Update calendar event",
      input: { eventId, update: normalized },
    };
  }

  return {
    mode: "chat",
    chatResponse:
      "I can help with web search, Gmail, and Google Calendar actions. Try: 'search web for ...', 'draft email to ...', or 'calendar create event ...'.",
    confidence: 0.5,
    summary: "General chat message without a detected tool",
  };
}

async function inferIntentWithOpenAI(message: string): Promise<OpenClawClassifierResponse | null> {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) return null;

  const body = {
    model: "gpt-4.1-mini",
    temperature: 0.0,
    messages: [
      {
        role: "system" as const,
        content:
          "Classify user requests into one of: WEB_SEARCH, GMAIL_READ, GMAIL_DRAFT, GMAIL_SEND, CALENDAR_READ, CALENDAR_WRITE, or CHAT. " +
          "Return strict JSON only: {\"mode\":\"tool\"|\"chat\", \"tool\":\"...\", \"actionType\":\"...\", \"input\":{}, \"chatResponse\":\"...\", \"confidence\":0.0, \"summary\":\"...\"}. " +
          "For non-tool chats, set mode=chat and fill chatResponse. For tools, include actionType compatible with web_search, gmail_search, gmail_read, gmail_create_draft, gmail_send_draft, calendar_search, calendar_create_event, calendar_update_event.",
      },
      {
        role: "user" as const,
        content: message,
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json().catch(() => null)) as any;
    const content = typeof json?.choices?.[0]?.message?.content === "string" ? json.choices[0].message.content : null;
    if (!content) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }

    const maybe = parsed as Record<string, unknown>;
    const toolValue =
      typeof maybe.tool === "string" ? (maybe.tool.toUpperCase() as keyof typeof AiTool) : undefined;
    const actionType =
      typeof maybe.actionType === "string" ? maybe.actionType.toLowerCase() : "chat";
    const confidence = typeof maybe.confidence === "number" ? maybe.confidence : 0.7;
    const summary = typeof maybe.summary === "string" ? maybe.summary : "OpenAI-classified intent";

    if (maybe.mode === "tool" && typeof toolValue === "string") {
      const tool = AiTool[toolValue as keyof typeof AiTool];
      if (!tool) return null;
      const input = typeof maybe.input === "object" && maybe.input !== null ? (maybe.input as OpenClawToolInput) : {};
      return { mode: "tool", tool, actionType, input, confidence, summary };
    }

    if (maybe.mode === "chat") {
      const chatResponse =
        typeof maybe.chatResponse === "string" && maybe.chatResponse.trim().length > 0
          ? maybe.chatResponse
          : "I can help with web search, Gmail, and calendar tasks.";
      return { mode: "chat", chatResponse, confidence, summary };
    }
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  return null;
}

export async function inferOpenClawIntent(message: string): Promise<OpenClawIntent> {
  const openAiDecision = await inferIntentWithOpenAI(message);
  if (openAiDecision?.mode === "tool" && openAiDecision.tool && openAiDecision.actionType) {
      return {
        mode: "tool",
        tool: openAiDecision.tool,
        actionType: openAiDecision.actionType,
        input: openAiDecision.input ?? {},
        confidence: clamp(openAiDecision.confidence, 0, 1),
        summary: openAiDecision.summary ?? "Model reported a tool action.",
      };
    }

  if (openAiDecision?.mode === "chat" && openAiDecision.chatResponse) {
    return {
      mode: "chat",
      chatResponse: openAiDecision.chatResponse,
      confidence: clamp(openAiDecision.confidence, 0, 1),
      summary: openAiDecision.summary ?? "Model reported a conversational response.",
    };
  }

  const fallback = parseTextIntent(message);
  if (fallback.mode === "tool") return fallback;
  return fallback;
}

function clamp(value: number | undefined, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

export function toOpenClawContext(messages: Array<{ role: AiMessageRole; content: string }>): string {
  if (messages.length === 0) return "No prior context.";
  return messages
    .slice(-8)
    .map((m) => `${m.role.toLowerCase()}: ${m.content}`)
    .join("\n");
}
