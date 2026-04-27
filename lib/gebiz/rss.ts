import "server-only";

import Parser from "rss-parser";

export type GebizRssItem = {
  title: string;
  link?: string;
  guid?: string;
  pubDate?: Date;
  isoDate?: Date;
  categories: string[];
  description?: string;
};

export type GebizRssErrorCode =
  | "INVALID_URL"
  | "FETCH_FAILED"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "PARSE_FAILED";

export type GebizRssFetchError = {
  code: GebizRssErrorCode;
  message: string;
  status?: number;
};

export type GebizRssFetchResult = {
  ok: boolean;
  url: string;
  items: GebizRssItem[];
  error?: GebizRssFetchError;
};

export function stripHtml(input: string): string {
  return String(input ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateHttpUrl(raw: string): { ok: true; url: string } | { ok: false; error: GebizRssFetchError } {
  const s = String(raw ?? "").trim();
  if (!s) {
    return { ok: false, error: { code: "INVALID_URL", message: "RSS URL is required." } };
  }
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    return { ok: false, error: { code: "INVALID_URL", message: "RSS URL is invalid." } };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: { code: "INVALID_URL", message: "RSS URL must be http(s)." } };
  }
  return { ok: true, url: parsed.toString() };
}

function toDate(raw: unknown): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(String(raw));
  return Number.isFinite(d.getTime()) ? d : undefined;
}

function toArrayStrings(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
  return [String(raw)].filter(Boolean);
}

/**
 * Fetch and parse RSS feed items using rss-parser.
 *
 * Safety:
 * - Never throws (returns structured errors).
 * - Filters invalid items and coerces missing fields.
 * - Uses timeout via AbortController.
 */
export async function fetchGebizRss(params: {
  url: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<GebizRssFetchResult> {
  const validated = validateHttpUrl(params.url);
  if (!validated.ok) return { ok: false, url: String(params.url ?? "").trim(), items: [], error: validated.error };
  const url = validated.url;

  const parser: Parser = new Parser({
    headers: {
      "user-agent": "BuildyGeBizImporter/1.0 (+https://app.buildy.sg)",
      accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });

  try {
    const timeoutMs = params.timeoutMs ?? 12_000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    let xml: string;
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        headers: {
          "user-agent": "BuildyGeBizImporter/1.0 (+https://app.buildy.sg)",
          accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        clearTimeout(timer);
        return {
          ok: false,
          url,
          items: [],
          error: { code: "HTTP_ERROR", message: `RSS fetch failed (${res.status}).`, status: res.status },
        };
      }
      xml = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const feed = await parser.parseString(xml);
    const limit = params.limit && params.limit > 0 ? Math.floor(params.limit) : undefined;
    const items = (feed.items ?? []).slice(0, limit ?? 10_000);

    const out: GebizRssItem[] = [];
    for (const it of items) {
      const title = String((it as any).title ?? "").trim();
      if (!title) continue;

      const description =
        String((it as any).contentSnippet ?? "").trim() ||
        String((it as any).content ?? "").trim() ||
        String((it as any).summary ?? "").trim() ||
        String((it as any).description ?? "").trim() ||
        undefined;

      out.push({
        title,
        link: String((it as any).link ?? "").trim() || undefined,
        guid: String((it as any).guid ?? "").trim() || undefined,
        pubDate: toDate((it as any).pubDate),
        isoDate: toDate((it as any).isoDate),
        categories: toArrayStrings((it as any).categories),
        description,
      });
    }

    return { ok: true, url, items: out };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const code: GebizRssErrorCode =
      message.toLowerCase().includes("aborted") ? "TIMEOUT" : "PARSE_FAILED";
    console.error("[gebiz/rss] Failed to fetch/parse feed:", err);
    return { ok: false, url, items: [], error: { code, message: message.slice(0, 400) } };
  }
}

/**
 * Backwards-compatible convenience function.
 * Prefer `fetchGebizRss()` for structured errors.
 */
export async function fetchGebizRssItems(params: {
  url: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<GebizRssItem[]> {
  const res = await fetchGebizRss(params);
  return res.items;
}
