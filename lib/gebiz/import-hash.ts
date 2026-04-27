import "server-only";

import crypto from "node:crypto";

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Hash-based unique key to improve dedupe across:
 * - missing/changed opportunity numbers
 * - varying RSS item links/guids
 *
 * This is NOT a security token. It is only for deduplication.
 */
export function computeGebizImportHash(input: {
  feedSourceId: string;
  guid?: string | null;
  link?: string | null;
  title: string;
  publishedAt?: Date | null;
}): string {
  const source = norm(input.feedSourceId);
  const guid = norm(input.guid);
  const link = norm(input.link);
  const title = norm(input.title);
  const published = input.publishedAt ? new Date(input.publishedAt).toISOString().slice(0, 10) : "";

  // Priority:
  // 1) guid
  // 2) link
  // 3) title + publishedDate
  // 4) title + sourceId
  const base = guid
    ? `guid|${source}|${guid}`
    : link
      ? `link|${source}|${link}`
      : title && published
        ? `title_pub|${source}|${title}|${published}`
        : `title|${source}|${title}`;

  return crypto.createHash("sha1").update(base).digest("hex").toUpperCase();
}
