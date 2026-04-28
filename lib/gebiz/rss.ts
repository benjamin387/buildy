import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import Parser from "rss-parser";
import { parseGeBizText } from "@/lib/bidding/gebiz-parser";
import { prisma } from "@/lib/prisma";

export type GebizRssItem = {
  title: string;
  link?: string;
  guid?: string;
  pubDate?: Date;
  isoDate?: Date;
  categories: string[];
  description?: string;
};

export type NormalizedGebizOpportunity = {
  sourceId: string;
  title: string;
  agency: string | null;
  category: string | null;
  procurementMethod: string | null;
  publishedAt: Date | null;
  closingAt: Date | null;
  detailUrl: string | null;
  status: string;
  rawJson: Prisma.InputJsonValue;
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
  rawItems: Array<Record<string, unknown>>;
  error?: GebizRssFetchError;
};

export type GebizImportResult = {
  importedCount: number;
  skippedCount: number;
  errors: string[];
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

function asTrimmedString(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return value || undefined;
}

function getObjectValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] != null) return record[key];
  }
  return undefined;
}

function parseStatus(text: string, closingAt: Date | null): string {
  const lowered = text.toLowerCase();
  if (lowered.includes("cancelled") || lowered.includes("canceled")) return "CANCELLED";
  if (lowered.includes("awarded")) return "AWARDED";
  if (lowered.includes("closed")) return "CLOSED";
  if (closingAt && closingAt.getTime() < Date.now()) return "CLOSED";
  return "OPEN";
}

function parseDetailUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const validated = validateHttpUrl(raw);
  return validated.ok ? validated.url : null;
}

function parsePublishedAt(item: Record<string, unknown>): Date | null {
  return (
    toDate(getObjectValue(item, ["isoDate", "pubDate", "publishedAt", "published", "date"])) ??
    null
  );
}

function parseClosingAt(item: Record<string, unknown>, text: string): Date | null {
  return (
    toDate(getObjectValue(item, ["closingAt", "closingDate", "closing_date", "deadline"])) ??
    parseGeBizText(text).closingDate ??
    null
  );
}

function parseProcurementMethod(text: string, fallback?: string): string | null {
  const explicit =
    text.match(/\b(?:Procurement\s*Method|Method)\s*[:\-]\s*(.+)$/im)?.[1]?.trim() ||
    undefined;
  return explicit ?? fallback ?? null;
}

function buildSourceId(item: Record<string, unknown>, detailUrl: string | null, publishedAt: Date | null, text: string): string {
  const guid = asTrimmedString(item.guid);
  if (guid) return `guid:${guid}`;
  if (detailUrl) return `url:${detailUrl}`;

  const stableHash = createHash("sha256")
    .update(
      JSON.stringify({
        title: asTrimmedString(item.title) ?? "",
        publishedAt: publishedAt?.toISOString() ?? null,
        text,
      }),
    )
    .digest("hex");
  return `hash:${stableHash}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function normalizeGebizItem(item: Record<string, unknown>): NormalizedGebizOpportunity | null {
  const title = asTrimmedString(item.title);
  if (!title) return null;

  const detailUrl = parseDetailUrl(asTrimmedString(item.link));
  const description =
    asTrimmedString(item.contentSnippet) ??
    asTrimmedString(item.content) ??
    asTrimmedString(item.summary) ??
    asTrimmedString(item.description) ??
    "";
  const publishedAt = parsePublishedAt(item);
  const text = [title, stripHtml(description)].filter(Boolean).join("\n");
  const parsed = parseGeBizText(text);
  const closingAt = parseClosingAt(item, text);
  const categories = toArrayStrings(item.categories);
  const procurementMethod = parseProcurementMethod(text, parsed.procurementType);
  const sourceId = buildSourceId(item, detailUrl, publishedAt, text);
  const status = parseStatus(text, closingAt);

  return {
    sourceId,
    title,
    agency: parsed.agency ?? asTrimmedString(item.creator) ?? null,
    category: parsed.category ?? categories[0] ?? null,
    procurementMethod,
    publishedAt,
    closingAt,
    detailUrl,
    status,
    rawJson: {
      title,
      link: detailUrl,
      guid: asTrimmedString(item.guid) ?? null,
      pubDate: asTrimmedString(item.pubDate) ?? null,
      isoDate: asTrimmedString(item.isoDate) ?? null,
      categories,
      description,
      parsed: {
        title: parsed.title ?? null,
        opportunityNo: parsed.opportunityNo ?? null,
        agency: parsed.agency ?? null,
        category: parsed.category ?? null,
        procurementType: parsed.procurementType ?? null,
        closingDate: parsed.closingDate?.toISOString() ?? null,
        briefingDate: parsed.briefingDate?.toISOString() ?? null,
        estimatedValue: parsed.estimatedValue ?? null,
      },
    },
  };
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
  url?: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<GebizRssFetchResult> {
  const targetUrl = params.url?.trim() || process.env.GEBIZ_RSS_URL?.trim() || "";
  const validated = validateHttpUrl(targetUrl);
  if (!validated.ok) return { ok: false, url: targetUrl, items: [], rawItems: [], error: validated.error };
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
          rawItems: [],
          error: { code: "HTTP_ERROR", message: `RSS fetch failed (${res.status}).`, status: res.status },
        };
      }
      xml = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const feed = await parser.parseString(xml);
    const limit = params.limit && params.limit > 0 ? Math.floor(params.limit) : undefined;
    const rawItems = ((feed.items ?? []) as Array<Record<string, unknown>>).slice(0, limit ?? 10_000);

    const out: GebizRssItem[] = [];
    for (const it of rawItems) {
      const title = String(it.title ?? "").trim();
      if (!title) continue;

      const description =
        String(it.contentSnippet ?? "").trim() ||
        String(it.content ?? "").trim() ||
        String(it.summary ?? "").trim() ||
        String(it.description ?? "").trim() ||
        undefined;

      out.push({
        title,
        link: String(it.link ?? "").trim() || undefined,
        guid: String(it.guid ?? "").trim() || undefined,
        pubDate: toDate(it.pubDate),
        isoDate: toDate(it.isoDate),
        categories: toArrayStrings(it.categories),
        description,
      });
    }

    return { ok: true, url, items: out, rawItems };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const code: GebizRssErrorCode =
      message.toLowerCase().includes("aborted") ? "TIMEOUT" : "PARSE_FAILED";
    console.error("[gebiz/rss] Failed to fetch/parse feed:", err);
    return { ok: false, url, items: [], rawItems: [], error: { code, message: message.slice(0, 400) } };
  }
}

export async function importGebizOpportunities(params?: {
  url?: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<GebizImportResult> {
  const rss = await fetchGebizRss({
    url: params?.url,
    limit: params?.limit,
    timeoutMs: params?.timeoutMs,
  });

  if (!rss.ok) {
    return {
      importedCount: 0,
      skippedCount: 0,
      errors: [rss.error ? `${rss.error.code}: ${rss.error.message}` : "Failed to fetch GeBIZ RSS feed."],
    };
  }

  const feedItems = rss.rawItems.length
    ? rss.rawItems
    : rss.items.map((item) => ({
        title: item.title,
        link: item.link,
        guid: item.guid,
        pubDate: item.pubDate?.toISOString(),
        isoDate: item.isoDate?.toISOString(),
        categories: item.categories,
        description: item.description,
      }));

  const normalizedItems: NormalizedGebizOpportunity[] = [];
  const seenSourceIds = new Set<string>();
  const seenDetailUrls = new Set<string>();
  let skippedCount = 0;

  for (const item of feedItems) {
    const normalized = normalizeGebizItem(item);
    if (!normalized) {
      skippedCount += 1;
      continue;
    }

    if (seenSourceIds.has(normalized.sourceId) || (normalized.detailUrl && seenDetailUrls.has(normalized.detailUrl))) {
      skippedCount += 1;
      continue;
    }

    seenSourceIds.add(normalized.sourceId);
    if (normalized.detailUrl) seenDetailUrls.add(normalized.detailUrl);
    normalizedItems.push(normalized);
  }

  if (normalizedItems.length === 0) {
    return {
      importedCount: 0,
      skippedCount,
      errors: [],
    };
  }

  const existingRows = await prisma.gebizOpportunity.findMany({
    where: {
      OR: [
        { sourceId: { in: normalizedItems.map((item) => item.sourceId) } },
        {
          detailUrl: {
            in: normalizedItems
              .map((item) => item.detailUrl)
              .filter((value): value is string => Boolean(value)),
          },
        },
      ],
    },
    select: { sourceId: true, detailUrl: true },
  });

  const existingSourceIds = new Set(existingRows.map((row) => row.sourceId));
  const existingDetailUrls = new Set(
    existingRows
      .map((row) => row.detailUrl)
      .filter((value): value is string => Boolean(value)),
  );

  let importedCount = 0;
  const errors: string[] = [];

  for (const item of normalizedItems) {
    if (existingSourceIds.has(item.sourceId) || (item.detailUrl && existingDetailUrls.has(item.detailUrl))) {
      skippedCount += 1;
      continue;
    }

    try {
      await prisma.gebizOpportunity.create({ data: item });
      importedCount += 1;
      existingSourceIds.add(item.sourceId);
      if (item.detailUrl) existingDetailUrls.add(item.detailUrl);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        skippedCount += 1;
        continue;
      }

      console.error("[gebiz/rss] Failed to store opportunity:", error);
      errors.push(`${item.title}: ${error instanceof Error ? error.message : "Database write failed."}`);
    }
  }

  return { importedCount, skippedCount, errors };
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
