import "server-only";

import { prisma } from "@/lib/prisma";
import { fetchGebizRss, stripHtml, type GebizRssFetchError } from "@/lib/gebiz/rss";
import { computeGebizImportHash } from "@/lib/gebiz/import-hash";
import { parseGeBizText } from "@/lib/bidding/gebiz-parser";
import { createBidOpportunity } from "@/lib/bidding/service";
import crypto from "node:crypto";

type ImportSummary = {
  startedAt: string;
  finishedAt: string;
  sourcesScanned: number;
  sourcesFailed: number;
  runsCreated: number;
  itemsFetched: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: number;
  perSource: Array<{
    sourceId: string;
    name: string;
    status: "SUCCESS" | "FAILED";
    itemsFetched: number;
    itemsCreated: number;
    itemsSkipped: number;
    itemsSkippedDuplicates: number;
    itemsSkippedFiltered: number;
    itemsFailed: number;
    rssError?: GebizRssFetchError;
    message?: string;
  }>;
};

function hashShort(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 10).toUpperCase();
}

function normalizeKeywordList(raw: string | null | undefined): string[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  return s
    .split(/[\n,;]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.toLowerCase());
}

function matchesKeywords(params: {
  text: string;
  include: string[];
  exclude: string[];
}): { ok: boolean; reason?: string } {
  const t = params.text.toLowerCase();
  if (params.exclude.some((k) => k && t.includes(k))) {
    return { ok: false, reason: "excluded_keyword" };
  }
  if (params.include.length > 0 && !params.include.some((k) => k && t.includes(k))) {
    return { ok: false, reason: "missing_include_keyword" };
  }
  return { ok: true };
}

function parseDateToken(raw: string): Date | undefined {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[,]/g, "");
  if (!s) return undefined;

  // dd/mm/yyyy [hh:mm [AM|PM]]
  const m1 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i.exec(s);
  if (m1) {
    const day = Number(m1[1]);
    const month = Number(m1[2]) - 1;
    const year = Number(m1[3]);
    let hour = m1[4] ? Number(m1[4]) : 0;
    const minute = m1[5] ? Number(m1[5]) : 0;
    const ampm = (m1[6] ?? "").toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const d = new Date(year, month, day, hour, minute, 0, 0);
    if (Number.isFinite(d.getTime())) return d;
  }

  // dd MMM yyyy [hh:mm [AM|PM]]
  const m2 = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i.exec(s);
  if (m2) {
    const months: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };
    const day = Number(m2[1]);
    const month = months[String(m2[2]).toLowerCase()] ?? -1;
    const year = Number(m2[3]);
    if (month >= 0) {
      let hour = m2[4] ? Number(m2[4]) : 0;
      const minute = m2[5] ? Number(m2[5]) : 0;
      const ampm = (m2[6] ?? "").toUpperCase();
      if (ampm === "PM" && hour < 12) hour += 12;
      if (ampm === "AM" && hour === 12) hour = 0;
      const d = new Date(year, month, day, hour, minute, 0, 0);
      if (Number.isFinite(d.getTime())) return d;
    }
  }

  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d;
  return undefined;
}

function parseClosingDateFromText(text: string): Date | undefined {
  const t = String(text ?? "");

  // Try to capture the line after "Closing Date" or "Closing Date/Time".
  const line =
    /\bclosing\s*(?:date(?:\/time)?|date\s*\/\s*time|time)?\s*[:\-]\s*([^\n]+)/i.exec(t)?.[1] ??
    /\bclosing\s*[:\-]\s*([^\n]+)/i.exec(t)?.[1] ??
    "";

  const candidates = [line, t].filter(Boolean);
  for (const s of candidates) {
    const token =
      /(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)?)/i.exec(s)?.[1] ??
      /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)?)/i.exec(s)?.[1];
    if (!token) continue;
    const d = parseDateToken(token);
    if (d) return d;
  }

  return undefined;
}

function parseBriefingDateFromText(text: string): Date | undefined {
  const t = String(text ?? "");
  const line =
    /\bbriefing\s*(?:date(?:\/time)?|date\s*\/\s*time|time)?\s*[:\-]\s*([^\n]+)/i.exec(t)?.[1] ??
    /\bsite\s*briefing\s*[:\-]\s*([^\n]+)/i.exec(t)?.[1] ??
    "";
  const candidates = [line, t].filter(Boolean);
  for (const s of candidates) {
    const token =
      /(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)?)/i.exec(s)?.[1] ??
      /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)?)/i.exec(s)?.[1];
    if (!token) continue;
    const d = parseDateToken(token);
    if (d) return d;
  }
  return undefined;
}

function parseProcurementTypeFromText(text: string): "QUOTATION" | "TENDER" | "RFI" | "FRAMEWORK" | undefined {
  const t = text.toLowerCase();
  if (/\bframework\b/.test(t)) return "FRAMEWORK";
  if (/\brfi\b/.test(t) || /\brequest\s+for\s+information\b/.test(t)) return "RFI";
  if (/\btender\b/.test(t)) return "TENDER";
  if (/\bquotation\b/.test(t) || /\brfq\b/.test(t)) return "QUOTATION";
  return undefined;
}

function parseCategoryFromText(text: string): string | undefined {
  const m = /\bcategory\s*[:\-]\s*(.+)$/im.exec(text) || /\bprocurement\s*category\s*[:\-]\s*(.+)$/im.exec(text);
  if (!m) return undefined;
  const v = String(m[1] ?? "").trim();
  return v ? v.slice(0, 180) : undefined;
}

function parseAgencyFromText(text: string): string | undefined {
  const m =
    /\bagency\s*[:\-]\s*(.+)$/im.exec(text) ||
    /\bbuyer\s*[:\-]\s*(.+)$/im.exec(text) ||
    /\borganisation\s*[:\-]\s*(.+)$/im.exec(text) ||
    /\borganization\s*[:\-]\s*(.+)$/im.exec(text);
  if (!m) return undefined;
  const v = String(m[1] ?? "").trim();
  return v ? v.slice(0, 160) : undefined;
}

function parseEstimatedValueFromText(text: string): number | undefined {
  const m =
    /\bestimated\s*(?:contract\s*)?value\s*[:\-]\s*(SGD[^\n]+|\\$[^\n]+|[0-9][0-9,\\.]+)/i.exec(text) ||
    /\bindicative\s*value\s*[:\-]\s*(SGD[^\n]+|\\$[^\n]+|[0-9][0-9,\\.]+)/i.exec(text) ||
    /\bbudget\s*(?:range|value)?\s*[:\-]\s*(SGD[^\n]+|\\$[^\n]+|[0-9][0-9,\\.]+)/i.exec(text);
  if (!m) return undefined;
  const cleaned = String(m[1] ?? "").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function deriveOpportunityNo(parsedNo: string | undefined, link: string | undefined, guid: string | undefined, title: string): string {
  const candidate = (parsedNo ?? "").trim();
  if (candidate) return candidate;
  const m = /\b([A-Z]{2,8}[0-9]{3,}[A-Z0-9\-\/]*)\b/.exec(title);
  if (m?.[1]) return m[1];
  const stable = link || guid || title;
  return `GEBIZ-${hashShort(stable)}`;
}

export async function runGebizRssImport(params?: {
  dryRun?: boolean;
  limitPerSource?: number;
  sourceId?: string;
  includeDisabled?: boolean;
}) : Promise<ImportSummary> {
  const dryRun = Boolean(params?.dryRun);
  const limitPerSource = params?.limitPerSource ?? 200;
  const sourceId = params?.sourceId?.trim() || null;
  const includeDisabled = Boolean(params?.includeDisabled);

  const sources = await prisma.gebizFeedSource.findMany({
    where: {
      ...(sourceId ? { id: sourceId } : {}),
      ...(sourceId && includeDisabled ? {} : { isEnabled: true }),
    },
    orderBy: [{ createdAt: "asc" }],
    include: { defaultOwnerUser: { select: { id: true, email: true, name: true } } },
  });

  const startedAt = new Date();
  const summary: ImportSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    sourcesScanned: sources.length,
    sourcesFailed: 0,
    runsCreated: 0,
    itemsFetched: 0,
    itemsCreated: 0,
    itemsSkipped: 0,
    errors: 0,
    perSource: [],
  };

  for (const src of sources) {
    const run = dryRun
      ? null
      : await prisma.gebizImportRun.create({
          data: {
            feedSourceId: src.id,
            status: "RUNNING",
            message: null,
            itemsFetched: 0,
            itemsCreated: 0,
            itemsSkipped: 0,
          },
        });
    if (run) summary.runsCreated += 1;

    try {
      const rss = await fetchGebizRss({ url: src.rssUrl, limit: limitPerSource, timeoutMs: 12_000 });
      if (!rss.ok) {
        summary.sourcesFailed += 1;
        summary.errors += 1;
        if (!dryRun && run) {
          await prisma.gebizImportRun.update({
            where: { id: run.id },
            data: {
              finishedAt: new Date(),
              status: "FAILED",
              message: rss.error?.message?.slice(0, 500) ?? "RSS fetch failed.",
              errorsJson: { rssError: rss.error },
            },
          });
        }

        summary.perSource.push({
          sourceId: src.id,
          name: src.name,
          status: "FAILED",
          itemsFetched: 0,
          itemsCreated: 0,
          itemsSkipped: 0,
          itemsSkippedDuplicates: 0,
          itemsSkippedFiltered: 0,
          itemsFailed: 0,
          rssError: rss.error,
          message: rss.error?.message ?? "RSS fetch failed.",
        });
        continue;
      }

      const items = rss.items;
      summary.itemsFetched += items.length;

      const include = normalizeKeywordList(src.keywordsInclude);
      const exclude = normalizeKeywordList(src.keywordsExclude);
      const minValue = src.minimumEstimatedValue != null ? Number(src.minimumEstimatedValue) : null;

      let created = 0;
      let skippedDuplicates = 0;
      let skippedFiltered = 0;
      const itemErrors: Array<{ opportunityNo?: string; link?: string; guid?: string; error: string }> = [];
      let itemFailed = 0;

      // Pre-dedupe via one DB fetch to avoid N queries.
      const candidateOppNos: string[] = [];
      const candidateLinks: string[] = [];
      const candidateGuids: string[] = [];

      const candidates: Array<{
        opportunityNo: string;
        importHash: string;
        title: string;
        agency: string;
        procurementType: any;
        category: string | null;
        closingDate: Date | null;
        briefingDate: Date | null;
        estimatedValue: number | null;
        publishedAt: Date | null;
        categories: string[];
        link: string | null;
        guid: string | null;
        parsed: any;
        descText: string;
        publishedAtRaw: Date | null;
      }> = [];

      for (const item of items) {
        try {
          const descText = item.description ? stripHtml(item.description) : "";
          const combined = [item.title, descText, item.link ?? ""].filter(Boolean).join("\n");
          const parsed = parseGeBizText(combined);

          const opportunityNo = deriveOpportunityNo(parsed.opportunityNo, item.link, item.guid, item.title);
          const title = (parsed.title ?? item.title).trim();
          const agency = (parsed.agency ?? parseAgencyFromText(descText) ?? src.procurementCategoryName ?? "GeBIZ").trim();
          const procurementType = (parsed.procurementType ?? parseProcurementTypeFromText(combined) ?? "QUOTATION") as any;
          const category = (parsed.category ?? parseCategoryFromText(descText) ?? src.procurementCategoryName ?? item.categories[0] ?? null) || null;
          const closingDate = parsed.closingDate ?? parseClosingDateFromText(descText) ?? null;
          const briefingDate = parsed.briefingDate ?? parseBriefingDateFromText(descText) ?? null;
          const estimatedValue = parsed.estimatedValue ?? parseEstimatedValueFromText(descText) ?? null;
          const publishedAt = item.isoDate ?? item.pubDate ?? null;
          const importHash = computeGebizImportHash({
            feedSourceId: src.id,
            title,
            guid: item.guid ?? null,
            link: item.link ?? null,
            publishedAt,
          });

          const keywordCheck = matchesKeywords({
            text: `${opportunityNo} ${title} ${agency} ${category ?? ""} ${descText}`,
            include,
            exclude,
          });
          if (!keywordCheck.ok) {
            skippedFiltered += 1;
            continue;
          }

          if (minValue != null && estimatedValue != null && estimatedValue < minValue) {
            skippedFiltered += 1;
            continue;
          }

          candidates.push({
            opportunityNo,
            importHash,
            title,
            agency,
            procurementType,
            category,
            closingDate,
            briefingDate,
            estimatedValue: estimatedValue != null ? estimatedValue : null,
            publishedAt,
            categories: item.categories ?? [],
            link: item.link ?? null,
            guid: item.guid ?? null,
            parsed,
            descText,
            publishedAtRaw: publishedAt,
          });

          candidateOppNos.push(opportunityNo);
          if (item.link) candidateLinks.push(item.link);
          if (item.guid) candidateGuids.push(item.guid);
        } catch (err) {
          summary.errors += 1;
          const msg = err instanceof Error ? err.message : "Unknown error";
          itemFailed += 1;
          itemErrors.push({ link: item.link, guid: item.guid, error: msg.slice(0, 300) });
        }
      }

      const existingImports = await prisma.gebizImportedItem.findMany({
        where: {
          feedSourceId: src.id,
          OR: [
            { opportunityNo: { in: Array.from(new Set(candidateOppNos)) } },
            { importHash: { in: Array.from(new Set(candidates.map((c) => c.importHash))) } },
            ...(candidateLinks.length ? [{ detailUrl: { in: Array.from(new Set(candidateLinks)) } }] : []),
            ...(candidateGuids.length ? [{ sourceGuid: { in: Array.from(new Set(candidateGuids)) } }] : []),
          ],
        },
        select: { opportunityNo: true, detailUrl: true, importHash: true, sourceGuid: true },
      });
      const existingOppNo = new Set(existingImports.map((x) => x.opportunityNo));
      const existingUrl = new Set(existingImports.map((x) => x.detailUrl).filter((x): x is string => !!x));
      const existingHash = new Set(existingImports.map((x) => x.importHash).filter((x): x is string => !!x));
      const existingGuid = new Set(existingImports.map((x) => x.sourceGuid).filter((x): x is string => !!x));

      const existingBids = src.autoImport
        ? await prisma.bidOpportunity.findMany({
            where: {
              OR: [
                { opportunityNo: { in: Array.from(new Set(candidateOppNos)) } },
                { importHash: { in: Array.from(new Set(candidates.map((c) => c.importHash))) } },
              ],
            },
            select: { id: true, opportunityNo: true, importHash: true },
          })
        : [];
      const bidByOppNo = new Map(existingBids.map((b) => [b.opportunityNo, b.id]));
      const bidByHash = new Map(existingBids.map((b) => [b.importHash, b.id]).filter((x): x is [string, string] => !!x[0]));

      for (const c of candidates) {
        if (existingOppNo.has(c.opportunityNo)) {
          skippedDuplicates += 1;
          continue;
        }
        if (c.link && existingUrl.has(c.link)) {
          skippedDuplicates += 1;
          continue;
        }
        if (existingHash.has(c.importHash)) {
          skippedDuplicates += 1;
          continue;
        }
        if (c.guid && existingGuid.has(c.guid)) {
          skippedDuplicates += 1;
          continue;
        }

        let bidOpportunityId: string | null = null;

        if (!dryRun && src.autoImport) {
          // If bid already exists, link it. Otherwise create it.
          const existingBidId = bidByHash.get(c.importHash) ?? bidByOppNo.get(c.opportunityNo) ?? null;
          if (existingBidId) {
            bidOpportunityId = existingBidId;
          } else {
            const remarks = [
              `Imported from GeBIZ RSS feed: ${src.name}`,
              c.link ? `Detail URL: ${c.link}` : null,
              src.defaultOwnerUser ? `Default owner: ${src.defaultOwnerUser.email}` : null,
            ]
              .filter(Boolean)
              .join("\n");

            const bid = await createBidOpportunity({
              opportunityNo: c.opportunityNo,
              importHash: c.importHash,
              title: c.title,
              agency: c.agency,
              procurementType: c.procurementType,
              category: c.category,
              closingDate: c.closingDate,
              briefingDate: c.briefingDate,
              estimatedValue: c.estimatedValue,
              targetMargin: null,
              remarks,
            });
            bidOpportunityId = bid.id;
            bidByOppNo.set(c.opportunityNo, bid.id);
            bidByHash.set(c.importHash, bid.id);
          }
        }

        if (!dryRun) {
          await prisma.gebizImportedItem.create({
            data: {
              feedSourceId: src.id,
              importRunId: run?.id ?? null,
              opportunityNo: c.opportunityNo,
              title: c.title,
              agency: c.agency,
              publishedAt: c.publishedAt,
              closingDate: c.closingDate,
              category: c.category,
              detailUrl: c.link,
              sourceGuid: c.guid,
              importHash: c.importHash,
              estimatedValue: c.estimatedValue != null ? c.estimatedValue : null,
              rawJson: {
                rss: {
                  title: c.title,
                  link: c.link,
                  guid: c.guid,
                  pubDate: c.publishedAt ? c.publishedAt.toISOString() : null,
                  isoDate: c.publishedAtRaw ? c.publishedAtRaw.toISOString() : null,
                  categories: c.categories,
                },
                parsed: c.parsed,
                descriptionText: c.descText.slice(0, 4000),
              },
              bidOpportunityId,
            },
          });
        }

        created += 1;
      }

      const skipped = skippedDuplicates + skippedFiltered;
      summary.itemsCreated += created;
      summary.itemsSkipped += skipped;

      if (!dryRun && run) {
        await prisma.gebizImportRun.update({
          where: { id: run.id },
          data: {
            finishedAt: new Date(),
            status: "SUCCESS",
            itemsFetched: items.length,
            itemsCreated: created,
            itemsSkipped: skipped,
            message: `OK: ${created} created, ${skipped} skipped.`,
            errorsJson: {
              rss: { url: rss.url },
              skipped: { duplicates: skippedDuplicates, filtered: skippedFiltered },
              itemErrors: itemErrors.slice(0, 50),
            },
          },
        });
      }

      summary.perSource.push({
        sourceId: src.id,
        name: src.name,
        status: "SUCCESS",
        itemsFetched: items.length,
        itemsCreated: created,
        itemsSkipped: skipped,
        itemsSkippedDuplicates: skippedDuplicates,
        itemsSkippedFiltered: skippedFiltered,
        itemsFailed: itemFailed,
      });
    } catch (err) {
      summary.errors += 1;
      summary.sourcesFailed += 1;
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (!dryRun && run) {
        await prisma.gebizImportRun.update({
          where: { id: run.id },
          data: {
            finishedAt: new Date(),
            status: "FAILED",
            message: msg.slice(0, 500),
            errorsJson: { error: msg },
          },
        });
      }

      summary.perSource.push({
        sourceId: src.id,
        name: src.name,
        status: "FAILED",
        itemsFetched: 0,
        itemsCreated: 0,
        itemsSkipped: 0,
        itemsSkippedDuplicates: 0,
        itemsSkippedFiltered: 0,
        itemsFailed: 0,
        message: msg,
      });
    }
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}
