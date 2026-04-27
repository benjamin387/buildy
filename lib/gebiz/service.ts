import "server-only";

import { prisma } from "@/lib/prisma";
import { createBidOpportunity } from "@/lib/bidding/service";
import { fetchGebizRss, validateHttpUrl } from "@/lib/gebiz/rss";
import { computeGebizImportHash } from "@/lib/gebiz/import-hash";

export function toMoney(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export async function listGebizFeedSources() {
  return prisma.gebizFeedSource.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      defaultOwnerUser: { select: { id: true, email: true, name: true } },
      _count: { select: { importedItems: true, importRuns: true } },
    },
  });
}

export async function upsertGebizFeedSource(input: {
  id?: string | null;
  name: string;
  rssUrl: string;
  procurementCategoryName?: string | null;
  isEnabled: boolean;
  autoImport: boolean;
  defaultOwnerUserId?: string | null;
  minimumEstimatedValue?: number | null;
  keywordsInclude?: string | null;
  keywordsExclude?: string | null;
}) {
  const validatedUrl = validateHttpUrl(input.rssUrl);
  if (!validatedUrl.ok) throw new Error(validatedUrl.error.message);

  const data = {
    name: input.name.trim(),
    rssUrl: validatedUrl.url,
    procurementCategoryName: input.procurementCategoryName?.trim() || null,
    isEnabled: Boolean(input.isEnabled),
    autoImport: Boolean(input.autoImport),
    defaultOwnerUserId: input.defaultOwnerUserId || null,
    minimumEstimatedValue: input.minimumEstimatedValue == null ? null : toMoney(input.minimumEstimatedValue),
    keywordsInclude: input.keywordsInclude?.trim() || null,
    keywordsExclude: input.keywordsExclude?.trim() || null,
  };

  if (!data.name) throw new Error("Feed name is required.");
  if (!data.rssUrl) throw new Error("RSS URL is required.");

  // Prevent duplicate feed URLs (case-insensitive).
  const dup = await prisma.gebizFeedSource.findFirst({
    where: {
      rssUrl: { equals: data.rssUrl, mode: "insensitive" },
      ...(input.id ? { NOT: { id: input.id } } : {}),
    },
    select: { id: true, name: true },
  });
  if (dup) throw new Error(`This RSS URL is already registered (feed: ${dup.name}).`);

  // Validate RSS feed can be fetched before saving (production-hardening).
  const test = await fetchGebizRss({ url: data.rssUrl, limit: 1, timeoutMs: 8_000 });
  if (!test.ok) {
    throw new Error(`RSS cannot be fetched: ${test.error?.message ?? "Unknown error"}`);
  }
  if (test.items.length === 0) {
    throw new Error("RSS feed returned no items. Verify the feed URL is correct and publicly accessible.");
  }

  if (input.id) {
    return prisma.gebizFeedSource.update({ where: { id: input.id }, data });
  }

  return prisma.gebizFeedSource.create({ data });
}

export async function deleteGebizFeedSource(id: string) {
  return prisma.gebizFeedSource.delete({ where: { id } });
}

export async function listGebizImportRuns(params?: { take?: number }) {
  return prisma.gebizImportRun.findMany({
    orderBy: [{ startedAt: "desc" }],
    take: params?.take ?? 30,
    include: { feedSource: { select: { id: true, name: true } } },
  });
}

export async function listGebizImportedItems(params?: { take?: number }) {
  return prisma.gebizImportedItem.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: params?.take ?? 50,
    include: {
      feedSource: { select: { id: true, name: true } },
      bidOpportunity: { select: { id: true, opportunityNo: true, status: true, title: true } },
    },
  });
}

export async function convertImportedItemToBidOpportunity(importedItemId: string) {
  const item = await prisma.gebizImportedItem.findUnique({
    where: { id: importedItemId },
    include: { feedSource: { include: { defaultOwnerUser: { select: { email: true } } } } },
  });
  if (!item) throw new Error("Imported item not found.");
  if (item.bidOpportunityId) return { bidOpportunityId: item.bidOpportunityId };

  const importHash =
    item.importHash ??
    computeGebizImportHash({
      feedSourceId: item.feedSourceId,
      title: item.title,
      guid: item.sourceGuid ?? null,
      link: item.detailUrl ?? null,
      publishedAt: item.publishedAt ?? null,
    });

  const existing =
    (await prisma.bidOpportunity.findFirst({
      where: {
        OR: [
          { importHash },
          { opportunityNo: item.opportunityNo },
        ],
      },
      select: { id: true },
    })) ?? null;
  const bidOpportunityId = existing?.id ?? null;

  let createdId = bidOpportunityId;
  if (!createdId) {
    const remarks = [
      `Converted from GeBIZ import: ${item.feedSource.name}`,
      item.detailUrl ? `Detail URL: ${item.detailUrl}` : null,
      item.feedSource.defaultOwnerUser ? `Default owner: ${item.feedSource.defaultOwnerUser.email}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const bid = await createBidOpportunity({
      opportunityNo: item.opportunityNo,
      importHash,
      title: item.title,
      agency: item.agency || item.feedSource.procurementCategoryName || "GeBIZ",
      procurementType: "QUOTATION",
      category: item.category ?? item.feedSource.procurementCategoryName ?? null,
      closingDate: item.closingDate ?? null,
      briefingDate: null,
      estimatedValue: item.estimatedValue != null ? Number(item.estimatedValue) : null,
      targetMargin: null,
      remarks,
    });
    createdId = bid.id;
  }

  await prisma.gebizImportedItem.update({
    where: { id: item.id },
    data: { bidOpportunityId: createdId, importHash },
  });

  return { bidOpportunityId: createdId };
}
