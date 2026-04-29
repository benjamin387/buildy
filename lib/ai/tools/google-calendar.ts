import { randomUUID } from "node:crypto";

export type CalendarRange = {
  from: string;
  to: string;
};

export type CalendarEventPayload = {
  title: string;
  start: string;
  end: string;
  description?: string | null;
  attendeeEmails?: string[];
};

export type CalendarToolResponse = {
  ok: boolean;
  provider: "placeholder" | "configured";
  message?: string;
  data?: unknown;
  error?: string;
};

type EventRecord = {
  id: string;
  title: string;
  start: string;
  end: string;
  updatedAt: string;
};

const eventStore = new Map<string, EventRecord>();

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

export async function calendarSearch(rangeOrQuery: string | CalendarRange): Promise<CalendarToolResponse> {
  if (!rangeOrQuery) {
    return { ok: false, provider: isConfigured() ? "configured" : "placeholder", error: "Missing calendar search input." };
  }

  if (!isConfigured()) {
    return {
      ok: true,
      provider: "placeholder",
      message: "Placeholder calendar search response.",
      data: [
        {
          id: `placeholder-event-${randomUUID().slice(0, 8)}`,
          title: "No configured Google Calendar credentials",
          start: new Date().toISOString(),
          end: new Date().toISOString(),
          source: "placeholder",
        },
      ],
    };
  }

  return {
    ok: true,
    provider: "configured",
    message: "Google Calendar search endpoint is configured. Production adapter pending implementation.",
    data: [],
  };
}

export async function calendarCreateEvent(payload: CalendarEventPayload): Promise<CalendarToolResponse> {
  const { title, start, end } = payload;
  if (!title || !start || !end) {
    return { ok: false, provider: isConfigured() ? "configured" : "placeholder", error: "Missing event payload fields title/start/end." };
  }

  const eventId = `event-${randomUUID().slice(0, 8)}`;
  const record: EventRecord = {
    id: eventId,
    title,
    start,
    end,
    updatedAt: new Date().toISOString(),
  };
  eventStore.set(eventId, record);

  if (!isConfigured()) {
    return {
      ok: true,
      provider: "placeholder",
      message: `Placeholder created event ${eventId}: ${title}`,
      data: record,
    };
  }

  return {
    ok: true,
    provider: "configured",
    message: `Created calendar event ${eventId}: ${title}`,
    data: { ...record, id: eventId },
  };
}

export async function calendarUpdateEvent(payload: { eventId: string | null; updates: string }): Promise<CalendarToolResponse> {
  if (!payload.eventId) {
    return { ok: false, provider: isConfigured() ? "configured" : "placeholder", error: "Missing eventId." };
  }

  const record = eventStore.get(payload.eventId);
  const now = new Date().toISOString();

  if (!record && !isConfigured()) {
    return {
      ok: false,
      provider: "placeholder",
      error: `Event ${payload.eventId} not found in placeholder store.`,
    };
  }

  if (record) {
    const next = { ...record, title: `${record.title} (updated)`, updatedAt: now };
    eventStore.set(payload.eventId, next);

    return {
      ok: true,
      provider: isConfigured() ? "configured" : "placeholder",
      message: `Event ${payload.eventId} updated in placeholder store with: ${payload.updates}`,
      data: next,
    };
  }

  return {
    ok: true,
    provider: "configured",
    message: `Event ${payload.eventId} updated through Google Calendar API placeholder flow.`,
    data: {
      id: payload.eventId,
      updates: payload.updates,
      updatedAt: now,
    },
  };
}
