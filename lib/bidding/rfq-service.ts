import "server-only";

import { prisma } from "@/lib/prisma";
import { generateRfqToken } from "@/lib/bidding/rfq-links";
import { toMoney } from "@/lib/bidding/service";
import { logAudit } from "@/lib/audit/logger";
import { AuditAction, AuditSource, BidRfqInviteStatus, BidRfqQuoteStatus, BidRfqStatus, BidTradePackageKey } from "@prisma/client";

export function defaultTradePackages(): Array<{ tradeKey: BidTradePackageKey; title: string }> {
  return [
    { tradeKey: "DEMOLITION", title: "Demolition / Hacking" },
    { tradeKey: "CARPENTRY", title: "Carpentry" },
    { tradeKey: "ELECTRICAL", title: "Electrical" },
    { tradeKey: "PLUMBING", title: "Plumbing" },
    { tradeKey: "PAINTING", title: "Painting" },
    { tradeKey: "FLOORING", title: "Flooring" },
    { tradeKey: "CEILING", title: "Ceiling / Partition" },
    { tradeKey: "ALUMINIUM", title: "Aluminium" },
    { tradeKey: "GLASS", title: "Glass" },
    { tradeKey: "ACMV", title: "ACMV" },
    { tradeKey: "FIRE_SAFETY", title: "Fire Safety" },
    { tradeKey: "OTHER", title: "Other" },
  ];
}

function clampDateOrNull(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function createBidRfq(params: {
  opportunityId: string;
  title: string;
  replyDeadline?: Date | null;
  briefingNotes?: string | null;
  scopeSummary?: string | null;
  tenderDocumentsJson?: unknown;
  boqLinesJson?: unknown;
  tradeKeys: BidTradePackageKey[];
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const title = params.title.trim();
  if (!title) throw new Error("RFQ title is required.");
  const tradeKeys = params.tradeKeys.length ? params.tradeKeys : defaultTradePackages().map((t) => t.tradeKey);

  const created = await prisma.$transaction(async (tx) => {
    const rfq = await tx.bidRfq.create({
      data: {
        opportunityId: params.opportunityId,
        title,
        status: "DRAFT",
        replyDeadline: params.replyDeadline ?? null,
        briefingNotes: params.briefingNotes ?? null,
        scopeSummary: params.scopeSummary ?? null,
        tenderDocumentsJson: params.tenderDocumentsJson as any,
        boqLinesJson: params.boqLinesJson as any,
        createdByName: params.actor?.name ?? null,
        createdByEmail: params.actor?.email ?? null,
        tradePackages: {
          create: tradeKeys.map((k, idx) => {
            const def = defaultTradePackages().find((x) => x.tradeKey === k);
            return {
              tradeKey: k,
              title: def?.title ?? k.replaceAll("_", " "),
              sortOrder: idx,
            };
          }),
        },
      },
      select: { id: true, opportunityId: true, title: true, status: true, replyDeadline: true, createdAt: true },
    });

    await tx.bidActivity.create({
      data: {
        opportunityId: params.opportunityId,
        type: "COSTING",
        title: "RFQ created",
        description: `RFQ "${title}" was created with ${tradeKeys.length} trade package(s).`,
        actorName: params.actor?.name ?? null,
        actorEmail: params.actor?.email ?? null,
      },
    });

    return rfq;
  });

  await logAudit({
    entityType: "BidRfq",
    entityId: created.id,
    action: AuditAction.CREATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: null,
    after: created,
    metadata: { opportunityId: params.opportunityId, tradeKeys },
  });

  return created;
}

export async function listBidRfqsForOpportunity(opportunityId: string) {
  return prisma.bidRfq.findMany({
    where: { opportunityId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      opportunityId: true,
      title: true,
      status: true,
      replyDeadline: true,
      sentAt: true,
      closedAt: true,
      createdAt: true,
      _count: { select: { tradePackages: true, supplierInvites: true, quotes: true } },
    },
  });
}

export async function getBidRfqDetail(rfqId: string) {
  return prisma.bidRfq.findUnique({
    where: { id: rfqId },
    include: {
      opportunity: { select: { id: true, opportunityNo: true, title: true, status: true, targetMargin: true, costingLockedAt: true, approvedCostVersionId: true } },
      tradePackages: { orderBy: [{ sortOrder: "asc" }], include: { preferredQuote: true } },
      supplierInvites: {
        orderBy: [{ createdAt: "desc" }],
        include: {
          supplier: { select: { id: true, name: true, email: true, phone: true } },
          tradePackage: { select: { id: true, tradeKey: true, title: true } },
          quote: { include: { lines: { orderBy: [{ sortOrder: "asc" }] } } },
        },
      },
      quotes: { orderBy: [{ updatedAt: "desc" }], include: { lines: { orderBy: [{ sortOrder: "asc" }] } } },
    },
  });
}

export async function createBidRfqInvite(params: {
  rfqId: string;
  tradePackageId?: string | null;
  supplierId?: string | null;
  supplierNameSnapshot: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  expiresAt?: Date | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const supplierNameSnapshot = params.supplierNameSnapshot.trim();
  if (!supplierNameSnapshot) throw new Error("Supplier name is required.");

  const token = generateRfqToken();
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const invite = await tx.bidRfqSupplierInvite.create({
      data: {
        rfqId: params.rfqId,
        tradePackageId: params.tradePackageId ?? null,
        supplierId: params.supplierId ?? null,
        supplierNameSnapshot,
        recipientName: params.recipientName ?? null,
        recipientEmail: params.recipientEmail ?? null,
        recipientPhone: params.recipientPhone ?? null,
        token,
        status: BidRfqInviteStatus.DRAFT,
        expiresAt: params.expiresAt ?? null,
      },
      select: { id: true, rfqId: true, token: true, supplierNameSnapshot: true, createdAt: true },
    });

    // Pre-create a DRAFT quote tied to this invite; supplier portal edits this quote.
    await tx.bidRfqQuote.create({
      data: {
        rfqId: params.rfqId,
        tradePackageId: params.tradePackageId ?? null,
        inviteId: invite.id,
        supplierId: params.supplierId ?? null,
        supplierNameSnapshot,
        status: BidRfqQuoteStatus.DRAFT,
      },
      select: { id: true },
    });

    const existing = await tx.bidRfq.findUnique({
      where: { id: params.rfqId },
      select: { id: true, sentAt: true, status: true },
    });
    await tx.bidRfq.update({
      where: { id: params.rfqId },
      data: {
        status: existing?.status === BidRfqStatus.DRAFT ? BidRfqStatus.IN_PROGRESS : existing?.status ?? BidRfqStatus.IN_PROGRESS,
        sentAt: existing?.sentAt ?? now,
      },
    });

    return invite;
  });

  await logAudit({
    entityType: "BidRfqSupplierInvite",
    entityId: created.id,
    action: AuditAction.CREATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: null,
    after: created,
    metadata: { rfqId: params.rfqId },
  });

  return created;
}

export async function getSupplierInviteForPortal(token: string) {
  if (!token.trim()) return null;
  const invite = await prisma.bidRfqSupplierInvite.findUnique({
    where: { token },
    include: {
      rfq: { include: { tradePackages: { orderBy: [{ sortOrder: "asc" }] } } },
      tradePackage: { select: { id: true, tradeKey: true, title: true, scopeSummary: true } },
      quote: { include: { lines: { orderBy: [{ sortOrder: "asc" }] } } },
    },
  });
  if (!invite) return null;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return null;
  if (invite.status === BidRfqInviteStatus.CANCELLED) return null;
  if (invite.rfq.status === BidRfqStatus.CANCELLED || invite.rfq.status === BidRfqStatus.CLOSED) return null;

  // Mark opened (best effort).
  if (!invite.openedAt && invite.status === BidRfqInviteStatus.SENT) {
    await prisma.bidRfqSupplierInvite.update({
      where: { id: invite.id },
      data: { openedAt: new Date(), status: BidRfqInviteStatus.OPENED },
    });
  } else if (!invite.openedAt && invite.status === BidRfqInviteStatus.DRAFT) {
    // Even if internal team hasn't marked "SENT", opening link means it was shared.
    await prisma.bidRfqSupplierInvite.update({
      where: { id: invite.id },
      data: { openedAt: new Date(), status: BidRfqInviteStatus.OPENED, sentAt: invite.sentAt ?? new Date() },
    });
  }

  return invite;
}

export async function submitSupplierQuoteByToken(params: {
  token: string;
  leadTimeDays?: number | null;
  exclusions?: string | null;
  remarks?: string | null;
  quotationFileUrl?: string | null;
  lines: Array<{ description: string; unit?: string | null; quantity: number; unitRate: number }>;
}) {
  const invite = await prisma.bidRfqSupplierInvite.findUnique({
    where: { token: params.token },
    include: {
      rfq: { select: { id: true, status: true, opportunityId: true } },
      quote: { select: { id: true } },
      tradePackage: { select: { tradeKey: true } },
    },
  });
  if (!invite) throw new Error("Invalid link.");
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) throw new Error("This link has expired.");
  if (invite.status === BidRfqInviteStatus.CANCELLED) throw new Error("This link is no longer active.");
  if (invite.rfq.status === BidRfqStatus.CANCELLED || invite.rfq.status === BidRfqStatus.CLOSED) throw new Error("This RFQ is closed.");
  if (!invite.quote?.id) throw new Error("Quote record is missing.");

  const cleanedLines = params.lines
    .map((l, idx) => ({
      description: String(l.description ?? "").trim(),
      unit: l.unit ? String(l.unit).trim() : null,
      quantity: toMoney(l.quantity),
      unitRate: toMoney(l.unitRate),
      sortOrder: idx,
    }))
    .filter((l) => l.description && l.quantity >= 0 && l.unitRate >= 0);

  if (cleanedLines.length === 0) throw new Error("Please add at least one line item.");

  await prisma.$transaction(async (tx) => {
    // Replace lines for simplicity and consistency.
    await tx.bidRfqQuoteLine.deleteMany({ where: { quoteId: invite.quote!.id } });

    await tx.bidRfqQuoteLine.createMany({
      data: cleanedLines.map((l) => ({
        quoteId: invite.quote!.id,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        unitRate: l.unitRate,
        totalAmount: toMoney(l.quantity * l.unitRate),
        sortOrder: l.sortOrder,
      })),
    });

    await tx.bidRfqQuote.update({
      where: { id: invite.quote!.id },
      data: {
        status: BidRfqQuoteStatus.SUBMITTED,
        leadTimeDays: params.leadTimeDays != null ? Math.max(0, Math.floor(Number(params.leadTimeDays))) : null,
        exclusions: params.exclusions?.trim() ? params.exclusions.trim() : null,
        remarks: params.remarks?.trim() ? params.remarks.trim() : null,
        quotationFileUrl: params.quotationFileUrl?.trim() ? params.quotationFileUrl.trim() : null,
        submittedAt: new Date(),
      },
    });

    await tx.bidRfqSupplierInvite.update({
      where: { id: invite.id },
      data: {
        status: BidRfqInviteStatus.REPLIED,
        repliedAt: new Date(),
        sentAt: invite.sentAt ?? new Date(),
      },
    });
  });

  await logAudit({
    entityType: "BidRfqQuote",
    entityId: invite.quote!.id,
    action: AuditAction.UPDATE,
    source: AuditSource.USER,
    actor: { name: invite.supplierNameSnapshot, email: invite.recipientEmail ?? null, role: "SUPPLIER" },
    before: null,
    after: { status: "SUBMITTED", lines: cleanedLines.length },
    metadata: { inviteId: invite.id, rfqId: invite.rfq.id },
  });

  await prisma.bidActivity.create({
    data: {
      opportunityId: invite.rfq.opportunityId,
      type: "COSTING",
      title: "Supplier quote submitted",
      description: `${invite.supplierNameSnapshot} submitted pricing for RFQ.`,
      actorName: invite.supplierNameSnapshot,
      actorEmail: invite.recipientEmail ?? null,
    },
  });

  return { ok: true as const, quoteId: invite.quote!.id, rfqId: invite.rfq.id };
}

export async function setPreferredQuoteForTradePackage(params: {
  tradePackageId: string;
  preferredQuoteId: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const before = await prisma.bidRfqTradePackage.findUnique({
    where: { id: params.tradePackageId },
    select: { id: true, preferredQuoteId: true, rfqId: true },
  });
  if (!before) throw new Error("Trade package not found.");

  const updated = await prisma.bidRfqTradePackage.update({
    where: { id: params.tradePackageId },
    data: { preferredQuoteId: params.preferredQuoteId },
    select: { id: true, rfqId: true, preferredQuoteId: true },
  });

  await logAudit({
    entityType: "BidRfqTradePackage",
    entityId: updated.id,
    action: AuditAction.UPDATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before,
    after: updated,
    metadata: { rfqId: updated.rfqId },
  });

  return updated;
}
