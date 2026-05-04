import "server-only";

import crypto from "node:crypto";
import { createBidOpportunity, type BidProcurementType } from "@/lib/bidding/service";
import { computeGebizImportHash } from "@/lib/gebiz/import-hash";
import { prisma } from "@/lib/prisma";

const HUB_SOURCE_ID = "gebiz-hub-sync";
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;
const PAGE_SIZE = 1000;
const DATE_COLUMN_CANDIDATES = [
  "published_at",
  "published_date",
  "publication_date",
  "created_at",
  "updated_at",
  "closing_date",
  "closing_at",
] as const;

type HubSyncParams = {
  importAll?: boolean;
  since?: string | null;
  limit?: number | null;
};

type HubTenderRow = Record<string, unknown>;

type NormalizedHubTender = {
  opportunityNo: string;
  title: string;
  agency: string;
  procurementType: BidProcurementType;
  category: string | null;
  closingDate: Date | null;
  briefingDate: Date | null;
  estimatedValue: number | null;
  detailUrl: string | null;
  publishedAt: Date | null;
  isRelevant: boolean;
  importHash: string;
  remarks: string;
};

type SupabaseQueryStrategy = {
  orderColumn: string | null;
  relevanceFilter: boolean;
};

export type GebizHubSyncResult = {
  ok: true;
  imported: number;
  skipped: number;
  scanned: number;
  failed: number;
  limit: number;
  importAll: boolean;
  since: string | null;
  orderColumn: string | null;
  relevanceFilter: boolean;
  errors: string[];
};

function clampLimit(raw: number | null | undefined) {
  if (!Number.isFinite(raw) || !raw || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}

function toSgtStartOfDay(raw: string | null | undefined): Date | null {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value).trim().replace(/\s+/g, " ");
  }
  return "";
}

function stringOrNull(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const normalized = normalizeText(value);
  if (!normalized) return null;

  const direct = new Date(normalized);
  if (Number.isFinite(direct.getTime())) return direct;

  const ddMmYyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i.exec(normalized);
  if (ddMmYyyy) {
    const day = Number(ddMmYyyy[1]);
    const month = Number(ddMmYyyy[2]) - 1;
    const year = Number(ddMmYyyy[3]);
    let hour = ddMmYyyy[4] ? Number(ddMmYyyy[4]) : 0;
    const minute = ddMmYyyy[5] ? Number(ddMmYyyy[5]) : 0;
    const ampm = (ddMmYyyy[6] ?? "").toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const parsed = new Date(year, month, day, hour, minute, 0, 0);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
}

function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  const normalized = normalizeText(value);
  if (!normalized) return null;
  const cleaned = normalized.replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function hashShort(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 10).toUpperCase();
}

function deriveProcurementType(row: HubTenderRow, title: string, category: string | null): BidProcurementType {
  const procurementHints = [
    row.procurement_type,
    row.procurement_method,
    row.tender_type,
    row.notice_type,
    row.document_type,
    title,
    category,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (procurementHints.includes("framework")) return "FRAMEWORK";
  if (procurementHints.includes("request for information") || /\brfi\b/.test(procurementHints)) return "RFI";
  if (
    procurementHints.includes("invitation to quote") ||
    procurementHints.includes("quotation") ||
    procurementHints.includes("quote")
  ) {
    return "QUOTATION";
  }
  if (procurementHints.includes("tender") || procurementHints.includes("itt")) return "TENDER";
  return "QUOTATION";
}

function extractReference(row: HubTenderRow) {
  return stringOrNull(
    row.opportunity_no,
    row.notice_no,
    row.notice_number,
    row.reference_no,
    row.reference_number,
    row.quotation_no,
    row.quotation_number,
    row.tender_no,
    row.tender_number,
    row.gebiz_id,
    row.external_id,
    row.source_id,
    row.id,
  );
}

function extractPublishedAt(row: HubTenderRow) {
  return (
    parseDate(row.published_at) ??
    parseDate(row.published_date) ??
    parseDate(row.publication_date) ??
    parseDate(row.created_at) ??
    parseDate(row.updated_at) ??
    null
  );
}

function extractClosingDate(row: HubTenderRow) {
  return (
    parseDate(row.closing_date) ??
    parseDate(row.closing_at) ??
    parseDate(row.deadline) ??
    parseDate(row.deadline_at) ??
    parseDate(row.submission_deadline) ??
    parseDate(row.submission_deadline_at) ??
    null
  );
}

function extractBriefingDate(row: HubTenderRow) {
  return (
    parseDate(row.briefing_date) ??
    parseDate(row.briefing_at) ??
    parseDate(row.site_briefing_date) ??
    parseDate(row.site_showround_date) ??
    parseDate(row.site_visit_date) ??
    null
  );
}

function extractRelevant(row: HubTenderRow) {
  const parsed =
    parseBoolean(row.is_relevant) ??
    parseBoolean(row.relevant) ??
    parseBoolean(row.ai_relevant) ??
    null;
  return parsed ?? true;
}

function normalizeHubTender(row: HubTenderRow): NormalizedHubTender | null {
  const title = stringOrNull(row.title, row.tender_title, row.notice_title, row.description, row.summary);
  if (!title) return null;

  const reference = extractReference(row);
  const publishedAt = extractPublishedAt(row);
  const closingDate = extractClosingDate(row);
  const briefingDate = extractBriefingDate(row);
  const detailUrl = stringOrNull(row.detail_url, row.tender_url, row.url, row.source_url, row.gebiz_url, row.link);
  const agency = stringOrNull(
    row.agency,
    row.agency_name,
    row.procuring_entity,
    row.procuring_agency,
    row.buyer,
    row.organisation,
    row.organization,
  ) ?? "GeBIZ Hub";
  const category = stringOrNull(
    row.category,
    row.procurement_category,
    row.procurement_category_name,
    row.industry,
    row.work_category,
  );
  const estimatedValue = parseMoney(
    row.estimated_value ?? row.estimated_contract_value ?? row.budget ?? row.value ?? row.contract_value,
  );
  const importHash = computeGebizImportHash({
    feedSourceId: HUB_SOURCE_ID,
    guid: stringOrNull(row.id, row.external_id, row.source_id, row.gebiz_id),
    link: detailUrl,
    title,
    publishedAt,
  });
  const opportunityNo = reference ?? `GEBIZ-HUB-${hashShort(importHash)}`;
  const procurementType = deriveProcurementType(row, title, category);
  const isRelevant = extractRelevant(row);

  const remarks = [
    "Imported from GeBIZ Hub Supabase sync.",
    detailUrl ? `Detail URL: ${detailUrl}` : null,
    reference ? `Hub reference: ${reference}` : null,
    stringOrNull(row.id, row.external_id, row.source_id) ? `Hub row id: ${stringOrNull(row.id, row.external_id, row.source_id)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    opportunityNo,
    title,
    agency,
    procurementType,
    category,
    closingDate,
    briefingDate,
    estimatedValue,
    detailUrl,
    publishedAt,
    isRelevant,
    importHash,
    remarks,
  };
}

function passesSinceFilter(tender: NormalizedHubTender, sinceDate: Date | null) {
  if (!sinceDate) return true;
  const comparable = tender.publishedAt ?? tender.closingDate ?? tender.briefingDate;
  if (!comparable) return false;
  return comparable.getTime() >= sinceDate.getTime();
}

function getOldestComparableDate(rows: NormalizedHubTender[]) {
  const dates = rows
    .map((row) => row.publishedAt ?? row.closingDate ?? row.briefingDate)
    .filter((value): value is Date => value instanceof Date && Number.isFinite(value.getTime()));
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((value) => value.getTime())));
}

function buildSupabaseUrl(strategy: SupabaseQueryStrategy, limit: number, offset: number) {
  const baseUrl = process.env.GEBIZ_HUB_SUPABASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("GEBIZ_HUB_SUPABASE_URL is not configured.");
  }

  const url = new URL("/rest/v1/tenders", baseUrl);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  if (strategy.orderColumn) {
    url.searchParams.set("order", `${strategy.orderColumn}.desc.nullslast`);
  }
  if (strategy.relevanceFilter) {
    url.searchParams.set("is_relevant", "eq.true");
  }
  return url;
}

async function fetchSupabaseRows(strategy: SupabaseQueryStrategy, limit: number, offset: number): Promise<HubTenderRow[]> {
  const apiKey = process.env.GEBIZ_HUB_SUPABASE_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEBIZ_HUB_SUPABASE_KEY is not configured.");
  }

  const response = await fetch(buildSupabaseUrl(strategy, limit, offset), {
    method: "GET",
    cache: "no-store",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Accept-Profile": "public",
    },
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Hub Supabase request failed (${response.status}): ${bodyText.slice(0, 400)}`);
  }

  const body = await response.json();
  if (!Array.isArray(body)) {
    throw new Error("Hub Supabase response was not an array.");
  }
  return body.filter((value): value is HubTenderRow => value !== null && typeof value === "object");
}

async function discoverStrategy(importAll: boolean): Promise<SupabaseQueryStrategy> {
  const candidates: SupabaseQueryStrategy[] = [
    ...DATE_COLUMN_CANDIDATES.flatMap((orderColumn) => [
      { orderColumn, relevanceFilter: !importAll },
      { orderColumn, relevanceFilter: false },
    ]),
    { orderColumn: null, relevanceFilter: !importAll },
    { orderColumn: null, relevanceFilter: false },
  ];

  for (const strategy of candidates) {
    try {
      await fetchSupabaseRows(strategy, 1, 0);
      return strategy;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const maybeColumnProblem =
        message.includes("column") ||
        message.includes("is_relevant") ||
        message.includes("order") ||
        message.includes("PGRST");
      if (!maybeColumnProblem) {
        throw error;
      }
    }
  }

  return { orderColumn: null, relevanceFilter: false };
}

export async function runGebizHubSync(params?: HubSyncParams): Promise<GebizHubSyncResult> {
  const limit = clampLimit(params?.limit);
  const importAll = Boolean(params?.importAll);
  const since = params?.since?.trim() || null;
  const sinceDate = toSgtStartOfDay(since);
  const pageSize = PAGE_SIZE;
  if (since && !sinceDate) {
    throw new Error("Invalid since date. Expected YYYY-MM-DD.");
  }

  const strategy = await discoverStrategy(importAll);
  const accepted: NormalizedHubTender[] = [];
  const seenImportHashes = new Set<string>();
  let scanned = 0;

  for (let offset = 0; accepted.length < limit; offset += pageSize) {
    const rows = await fetchSupabaseRows(strategy, pageSize, offset);
    if (rows.length === 0) break;

    const normalizedPage = rows
      .map((row) => normalizeHubTender(row))
      .filter((row): row is NormalizedHubTender => row !== null);

    scanned += rows.length;

    for (const tender of normalizedPage) {
      if (!importAll && !tender.isRelevant) continue;
      if (!passesSinceFilter(tender, sinceDate)) continue;
      if (seenImportHashes.has(tender.importHash)) continue;
      seenImportHashes.add(tender.importHash);
      accepted.push(tender);
      if (accepted.length >= limit) break;
    }

    if (rows.length < pageSize) break;

    const oldestComparableDate = getOldestComparableDate(normalizedPage);
    if (strategy.orderColumn && sinceDate && oldestComparableDate && oldestComparableDate.getTime() < sinceDate.getTime()) {
      break;
    }
  }

  const existing = accepted.length
    ? await prisma.bidOpportunity.findMany({
        where: {
          OR: [
            { importHash: { in: accepted.map((item) => item.importHash) } },
            { opportunityNo: { in: accepted.map((item) => item.opportunityNo) } },
          ],
        },
        select: { id: true, importHash: true, opportunityNo: true },
      })
    : [];
  const existingHashes = new Set(existing.map((item) => item.importHash).filter((value): value is string => Boolean(value)));
  const existingOpportunityNos = new Set(existing.map((item) => item.opportunityNo));

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const tender of accepted) {
    if (existingHashes.has(tender.importHash) || existingOpportunityNos.has(tender.opportunityNo)) {
      skipped += 1;
      continue;
    }

    try {
      const created = await createBidOpportunity({
        opportunityNo: tender.opportunityNo,
        importHash: tender.importHash,
        title: tender.title,
        agency: tender.agency,
        procurementType: tender.procurementType,
        category: tender.category,
        closingDate: tender.closingDate,
        briefingDate: tender.briefingDate,
        estimatedValue: tender.estimatedValue,
        targetMargin: null,
        remarks: tender.remarks,
      });
      imported += 1;
      existingHashes.add(tender.importHash);
      existingOpportunityNos.add(created.opportunityNo);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown import failure.";
      errors.push(`${tender.opportunityNo}: ${message}`);
    }
  }

  return {
    ok: true,
    imported,
    skipped,
    scanned,
    failed,
    limit,
    importAll,
    since,
    orderColumn: strategy.orderColumn,
    relevanceFilter: strategy.relevanceFilter,
    errors: errors.slice(0, 100),
  };
}
