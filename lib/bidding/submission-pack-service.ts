import "server-only";

import { prisma } from "@/lib/prisma";
import { createZip } from "@/lib/utils/zip";
import { AuditAction, AuditSource, TenderDocumentApprovalStatus, TenderPackItemSourceType, TenderSubmissionPackStatus } from "@prisma/client";
import { logAudit } from "@/lib/audit/logger";

function normalizeTitle(s: string) {
  const v = s.trim();
  return v || "Submission Pack";
}

export async function getLatestSubmissionPack(opportunityId: string) {
  return prisma.tenderSubmissionPack.findFirst({
    where: { opportunityId },
    orderBy: [{ versionNo: "desc" }],
    include: { items: { orderBy: [{ sortOrder: "asc" }] }, approvals: { orderBy: [{ createdAt: "desc" }] } },
  });
}

export async function createSubmissionPack(params: {
  opportunityId: string;
  title?: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const max = await prisma.tenderSubmissionPack.aggregate({
    where: { opportunityId: params.opportunityId },
    _max: { versionNo: true },
  });
  const next = (max._max.versionNo != null ? Number(max._max.versionNo) : 0) + 1;

  const title = normalizeTitle(params.title ?? `Submission Pack v${next}`);

  const pack = await prisma.tenderSubmissionPack.create({
    data: {
      opportunityId: params.opportunityId,
      versionNo: next,
      title,
      status: TenderSubmissionPackStatus.DRAFT,
      createdByName: params.actor?.name ?? null,
      createdByEmail: params.actor?.email ?? null,
    },
    include: { items: true, approvals: true },
  });

  await logAudit({
    entityType: "TenderSubmissionPack",
    entityId: pack.id,
    action: AuditAction.CREATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: null,
    after: pack,
    metadata: { opportunityId: params.opportunityId },
  });

  return pack;
}

export async function addPackItem(params: {
  packId: string;
  sourceType: TenderPackItemSourceType;
  complianceDocumentId?: string | null;
  generatedDocumentId?: string | null;
  bidDocumentId?: string | null;
  manualUrl?: string | null;
  title: string;
  category?: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const pack = await prisma.tenderSubmissionPack.findUnique({
    where: { id: params.packId },
    include: { items: true },
  });
  if (!pack) throw new Error("Pack not found.");
  if (pack.status === TenderSubmissionPackStatus.RELEASED) throw new Error("Pack is released and locked.");

  const maxOrder = pack.items.reduce((m, it) => Math.max(m, it.sortOrder ?? 0), 0);
  const item = await prisma.tenderSubmissionPackItem.create({
    data: {
      packId: params.packId,
      sourceType: params.sourceType,
      complianceDocumentId: params.complianceDocumentId ?? null,
      generatedDocumentId: params.generatedDocumentId ?? null,
      bidDocumentId: params.bidDocumentId ?? null,
      manualUrl: params.manualUrl ?? null,
      title: params.title.trim(),
      category: params.category ?? null,
      sortOrder: maxOrder + 1,
    },
  });

  await logAudit({
    entityType: "TenderSubmissionPackItem",
    entityId: item.id,
    action: AuditAction.CREATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: null,
    after: item,
    metadata: { packId: params.packId },
  });

  return item;
}

export async function updatePackItemOrder(params: {
  packId: string;
  orders: Array<{ itemId: string; sortOrder: number }>;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const pack = await prisma.tenderSubmissionPack.findUnique({ where: { id: params.packId }, select: { id: true, status: true } });
  if (!pack) throw new Error("Pack not found.");
  if (pack.status === TenderSubmissionPackStatus.RELEASED) throw new Error("Pack is released and locked.");

  await prisma.$transaction(
    params.orders.map((o) =>
      prisma.tenderSubmissionPackItem.update({
        where: { id: o.itemId },
        data: { sortOrder: Math.max(0, Math.floor(o.sortOrder)) },
      }),
    ),
  );

  await logAudit({
    entityType: "TenderSubmissionPack",
    entityId: params.packId,
    action: AuditAction.UPDATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: null,
    after: { reordered: true, count: params.orders.length },
    metadata: { action: "REORDER_PACK_ITEMS" },
  });
}

export async function requestPackApproval(params: {
  packId: string;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const pack = await prisma.tenderSubmissionPack.findUnique({ where: { id: params.packId } });
  if (!pack) throw new Error("Pack not found.");
  if (pack.status === TenderSubmissionPackStatus.RELEASED) throw new Error("Pack is released.");

  const updated = await prisma.tenderSubmissionPack.update({
    where: { id: params.packId },
    data: { status: TenderSubmissionPackStatus.APPROVAL_REQUIRED },
  });

  await logAudit({
    entityType: "TenderSubmissionPack",
    entityId: updated.id,
    action: AuditAction.STATUS_CHANGE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: { status: pack.status },
    after: { status: updated.status },
  });

  return updated;
}

export async function approvePack(params: {
  packId: string;
  approver: { name?: string | null; email?: string | null; role?: string | null } | null;
  remarks?: string | null;
}) {
  const pack = await prisma.tenderSubmissionPack.findUnique({ where: { id: params.packId } });
  if (!pack) throw new Error("Pack not found.");
  if (pack.status === TenderSubmissionPackStatus.RELEASED) throw new Error("Pack is released.");

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.tenderDocumentApproval.create({
      data: {
        packId: pack.id,
        approverName: params.approver?.name ?? "Director",
        approverEmail: params.approver?.email ?? null,
        status: TenderDocumentApprovalStatus.APPROVED,
        remarks: params.remarks?.trim() ? params.remarks.trim() : null,
        decidedAt: now,
      },
    });
    return tx.tenderSubmissionPack.update({
      where: { id: pack.id },
      data: { status: TenderSubmissionPackStatus.APPROVED, approvedAt: now },
    });
  });

  await logAudit({
    entityType: "TenderSubmissionPack",
    entityId: updated.id,
    action: AuditAction.APPROVE,
    source: AuditSource.USER,
    actor: params.approver,
    before: { status: pack.status },
    after: { status: updated.status, approvedAt: updated.approvedAt },
    metadata: { remarks: params.remarks ?? null },
  });

  return updated;
}

export async function releasePack(params: {
  packId: string;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const pack = await prisma.tenderSubmissionPack.findUnique({ where: { id: params.packId } });
  if (!pack) throw new Error("Pack not found.");
  if (pack.status !== TenderSubmissionPackStatus.APPROVED) throw new Error("Pack must be approved before release.");

  const now = new Date();
  const updated = await prisma.tenderSubmissionPack.update({
    where: { id: pack.id },
    data: { status: TenderSubmissionPackStatus.RELEASED, releasedAt: now },
  });

  await logAudit({
    entityType: "TenderSubmissionPack",
    entityId: updated.id,
    action: AuditAction.STATUS_CHANGE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: { status: pack.status },
    after: { status: updated.status, releasedAt: updated.releasedAt },
  });

  return updated;
}

export async function getSubmissionPackDetail(packId: string) {
  return prisma.tenderSubmissionPack.findUnique({
    where: { id: packId },
    include: {
      opportunity: { select: { id: true, opportunityNo: true, title: true, agency: true, procurementType: true, closingDate: true } },
      items: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          complianceDocument: true,
          generatedDocument: true,
        },
      },
      approvals: { orderBy: [{ createdAt: "desc" }] },
    },
  });
}

export async function buildSubmissionPackZip(packId: string) {
  const pack = await getSubmissionPackDetail(packId);
  if (!pack) throw new Error("Pack not found.");

  const files: Array<{ name: string; data: string | Buffer }> = [];
  const manifest = {
    packId: pack.id,
    title: pack.title,
    versionNo: pack.versionNo,
    status: pack.status,
    opportunity: pack.opportunity,
    createdAt: pack.createdAt,
    approvedAt: pack.approvedAt,
    releasedAt: pack.releasedAt,
    items: pack.items.map((i) => ({
      id: i.id,
      title: i.title,
      sourceType: i.sourceType,
      complianceDocumentId: i.complianceDocumentId,
      generatedDocumentId: i.generatedDocumentId,
      manualUrl: i.manualUrl,
      sortOrder: i.sortOrder,
    })),
  };

  files.push({ name: "manifest.json", data: JSON.stringify(manifest, null, 2) });

  const links: string[] = [];

  for (const item of pack.items) {
    if (item.generatedDocument?.contentHtml) {
      const safe = item.generatedDocument.docType.toLowerCase().replaceAll("_", "-");
      files.push({ name: `generated/${safe}-v${item.generatedDocument.versionNo}.html`, data: item.generatedDocument.contentHtml });
    }
    if (item.complianceDocument?.fileUrl) {
      links.push(`${item.title}\n${item.complianceDocument.fileUrl}\n`);
    }
    if (item.manualUrl) {
      links.push(`${item.title}\n${item.manualUrl}\n`);
    }
  }

  if (links.length) {
    files.push({ name: "links/external-documents.txt", data: links.join("\n") });
  }

  const zip = createZip(files);
  return { filename: `Submission-Pack-${pack.opportunity.opportunityNo}-v${pack.versionNo}.zip`, zip };
}

