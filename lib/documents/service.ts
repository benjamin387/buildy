import "server-only";

import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth/session";
import {
  getAllowedDocumentKinds,
  isClientViewer,
  asPublicDocumentType,
  type DocumentKind,
} from "@/lib/documents/access";
import { buildPublicUrlForDocument } from "@/lib/messaging/public-links";
import {
  PublicDocumentType,
  SignatureDocumentType,
  type MessageRelatedType,
  type SignatureRequestStatus,
} from "@prisma/client";

export type DocumentRegisterRow = {
  kind: DocumentKind;
  recordId: string;
  documentNumber: string;
  projectId: string | null;
  projectLabel: string | null;
  counterpartyLabel: string | null;
  status: string;
  version: number | null;
  createdAt: Date;
  sentAt: Date | null;
  viewedAt: Date | null;
  signedAt: Date | null;
  expiresAt: Date | null;
  signatureStatus: SignatureRequestStatus | "UNSIGNED" | null;
  secureLinkUrl: string | null;
  previewUrl: string;
  printUrl: string | null;
};

type RegisterFilters = {
  projectId?: string | null;
  kind?: DocumentKind | null;
  status?: string | null;
  signed?: "signed" | "unsigned" | null;
  sent?: "sent" | "not_sent" | null;
  expiredLinks?: "expired" | "active" | null;
};

function projectLabel(p: { name: string; projectCode: string | null } | null | undefined): string | null {
  if (!p) return null;
  return p.projectCode ? `${p.projectCode} · ${p.name}` : p.name;
}

function mapRelatedType(kind: DocumentKind): MessageRelatedType | null {
  if (kind === "DESIGN_PRESENTATION") return "DESIGN_PRESENTATION";
  if (kind === "QUOTATION") return "QUOTATION";
  if (kind === "CONTRACT") return "CONTRACT";
  if (kind === "INVOICE") return "INVOICE";
  if (kind === "VARIATION_ORDER") return "VARIATION_ORDER";
  if (kind === "PURCHASE_ORDER") return "PURCHASE_ORDER";
  if (kind === "SUBCONTRACT") return "SUBCONTRACT";
  if (kind === "SUPPLIER_BILL") return "SUPPLIER_BILL";
  return null;
}

function mapSignatureType(kind: DocumentKind): SignatureDocumentType | null {
  if (kind === "CONTRACT") return "CONTRACT";
  if (kind === "QUOTATION") return "QUOTATION";
  if (kind === "SUBCONTRACT") return "SUBCONTRACT";
  if (kind === "PURCHASE_ORDER") return "PURCHASE_ORDER";
  if (kind === "VARIATION_ORDER") return "VARIATION_ORDER";
  return null;
}

function isSignedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === "SIGNED";
}

export async function listDocumentRegister(params: {
  user: SessionUser;
  filters?: RegisterFilters;
  take?: number;
}): Promise<DocumentRegisterRow[]> {
  const take = Math.min(300, Math.max(20, params.take ?? 200));
  const allowed = getAllowedDocumentKinds(params.user);
  const filters = params.filters ?? {};
  const scopeProjectId = filters.projectId ?? null;

  const includeKind = (k: DocumentKind) => allowed.has(k) && (!filters.kind || filters.kind === k);

  const whereProject = scopeProjectId ? { projectId: scopeProjectId } : {};

  const queries: Array<Promise<DocumentRegisterRow[]>> = [];

  if (includeKind("DESIGN_PRESENTATION")) {
    queries.push(
      prisma.clientPresentation
        .findMany({
          where: {},
          orderBy: [{ updatedAt: "desc" }],
          take: 80,
          include: { designBrief: { include: { project: true } } },
        })
        .then((rows) =>
          rows
            .filter((r) => (scopeProjectId ? r.designBrief.projectId === scopeProjectId : true))
            .map((r) => ({
              kind: "DESIGN_PRESENTATION" as const,
              recordId: r.id,
              documentNumber: r.title || "Design presentation",
              projectId: r.designBrief.projectId,
              projectLabel: projectLabel(r.designBrief.project),
              counterpartyLabel: r.addressedTo ?? null,
              status: r.status,
              version: 1,
              createdAt: r.createdAt,
              sentAt: null,
              viewedAt: null,
              signedAt: null,
              expiresAt: null,
              signatureStatus: null,
              secureLinkUrl: null,
              previewUrl: `/projects/${r.designBrief.projectId}/design-brief/${r.designBriefId}/presentation`,
              printUrl: `/projects/${r.designBrief.projectId}/design-brief/${r.designBriefId}/presentation/print`,
            })),
        ),
    );
  }

  if (includeKind("QUOTATION")) {
    queries.push(
      prisma.quotation
        .findMany({
          where: { ...whereProject },
          orderBy: [{ createdAt: "desc" }],
          take: 120,
          include: { project: { select: { id: true, name: true, projectCode: true, clientName: true } }, client: true },
        })
        .then((rows) =>
          rows.map((q) => ({
            kind: "QUOTATION" as const,
            recordId: q.id,
            documentNumber: q.quotationNumber,
            projectId: q.projectId,
            projectLabel: projectLabel(q.project),
            counterpartyLabel: q.clientNameSnapshot || q.project.clientName || q.client.name,
            status: q.status,
            version: q.version,
            createdAt: q.createdAt,
            sentAt: null,
            viewedAt: null,
            signedAt: null,
            expiresAt: null,
            signatureStatus: null,
            secureLinkUrl: null,
            previewUrl: `/projects/${q.projectId}/quotations/${q.id}`,
            printUrl: `/projects/${q.projectId}/quotations/${q.id}/print`,
          })),
        ),
    );
  }

  if (includeKind("CONTRACT")) {
    queries.push(
      prisma.contract
        .findMany({
          where: { ...whereProject },
          orderBy: [{ createdAt: "desc" }],
          take: 120,
          include: { project: { select: { id: true, name: true, projectCode: true, clientName: true } } },
        })
        .then((rows) =>
          rows.map((c) => ({
            kind: "CONTRACT" as const,
            recordId: c.id,
            documentNumber: c.contractNumber,
            projectId: c.projectId,
            projectLabel: projectLabel(c.project),
            counterpartyLabel: c.clientNameSnapshot || c.project.clientName,
            status: c.status,
            version: c.version,
            createdAt: c.createdAt,
            sentAt: null,
            viewedAt: null,
            signedAt: c.signedAt ?? null,
            expiresAt: null,
            signatureStatus: null,
            secureLinkUrl: null,
            previewUrl: `/projects/${c.projectId}/contract/${c.id}`,
            printUrl: `/projects/${c.projectId}/contract/${c.id}/print`,
          })),
        ),
    );
  }

  if (includeKind("INVOICE")) {
    queries.push(
      prisma.invoice
        .findMany({
          where: { ...whereProject, status: { not: "VOID" } },
          orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
          take: 160,
          include: { project: { select: { id: true, name: true, projectCode: true, clientName: true } } },
        })
        .then((rows) =>
          rows.map((i) => ({
            kind: "INVOICE" as const,
            recordId: i.id,
            documentNumber: i.invoiceNumber,
            projectId: i.projectId,
            projectLabel: projectLabel(i.project),
            counterpartyLabel: i.project.clientName,
            status: i.status,
            version: 1,
            createdAt: i.createdAt,
            sentAt: null,
            viewedAt: null,
            signedAt: null,
            expiresAt: null,
            signatureStatus: null,
            secureLinkUrl: null,
            previewUrl: `/projects/${i.projectId}/invoices/${i.id}`,
            printUrl: `/projects/${i.projectId}/invoices/${i.id}/print`,
          })),
        ),
    );
  }

  if (includeKind("PURCHASE_ORDER")) {
    queries.push(
      prisma.purchaseOrder
        .findMany({
          where: { ...whereProject },
          orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
          take: 120,
          include: { project: { select: { id: true, name: true, projectCode: true } }, supplier: true },
        })
        .then((rows) =>
          rows.map((po) => ({
            kind: "PURCHASE_ORDER" as const,
            recordId: po.id,
            documentNumber: po.poNumber,
            projectId: po.projectId,
            projectLabel: projectLabel(po.project),
            counterpartyLabel: po.supplier.name,
            status: po.status,
            version: 1,
            createdAt: po.createdAt,
            sentAt: null,
            viewedAt: null,
            signedAt: null,
            expiresAt: null,
            signatureStatus: null,
            secureLinkUrl: null,
            previewUrl: `/projects/${po.projectId}/purchase-orders/${po.id}`,
            printUrl: `/projects/${po.projectId}/purchase-orders/${po.id}/print`,
          })),
        ),
    );
  }

  if (includeKind("SUBCONTRACT")) {
    queries.push(
      prisma.subcontract
        .findMany({
          where: { ...whereProject },
          orderBy: [{ createdAt: "desc" }],
          take: 120,
          include: { project: { select: { id: true, name: true, projectCode: true } }, supplier: true },
        })
        .then((rows) =>
          rows.map((s) => ({
            kind: "SUBCONTRACT" as const,
            recordId: s.id,
            documentNumber: s.subcontractNumber ?? s.title,
            projectId: s.projectId,
            projectLabel: projectLabel(s.project),
            counterpartyLabel: s.supplier.name,
            status: s.status,
            version: 1,
            createdAt: s.createdAt,
            sentAt: null,
            viewedAt: null,
            signedAt: null,
            expiresAt: null,
            signatureStatus: null,
            secureLinkUrl: null,
            previewUrl: `/projects/${s.projectId}/suppliers/subcontracts/${s.id}`,
            printUrl: `/projects/${s.projectId}/suppliers/subcontracts/${s.id}/print`,
          })),
        ),
    );
  }

  if (includeKind("SUPPLIER_BILL")) {
    queries.push(
      prisma.supplierBill
        .findMany({
          where: { ...whereProject, status: { not: "VOID" } },
          orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
          take: 160,
          include: { project: { select: { id: true, name: true, projectCode: true } }, supplier: true },
        })
        .then((rows) =>
          rows.map((b) => ({
            kind: "SUPPLIER_BILL" as const,
            recordId: b.id,
            documentNumber: b.billNumber,
            projectId: b.projectId,
            projectLabel: projectLabel(b.project),
            counterpartyLabel: b.supplier.name,
            status: b.status,
            version: 1,
            createdAt: b.createdAt,
            sentAt: null,
            viewedAt: null,
            signedAt: null,
            expiresAt: null,
            signatureStatus: null,
            secureLinkUrl: null,
            previewUrl: `/projects/${b.projectId}/supplier-bills/${b.id}`,
            printUrl: `/projects/${b.projectId}/supplier-bills/${b.id}/print`,
          })),
        ),
    );
  }

  if (includeKind("VARIATION_ORDER")) {
    queries.push(
      prisma.variationOrder
        .findMany({
          where: { ...whereProject },
          orderBy: [{ createdAt: "desc" }],
          take: 120,
          include: { project: { select: { id: true, name: true, projectCode: true, clientName: true } } },
        })
        .then((rows) =>
          rows.map((vo) => ({
            kind: "VARIATION_ORDER" as const,
            recordId: vo.id,
            documentNumber: vo.referenceNumber,
            projectId: vo.projectId,
            projectLabel: projectLabel(vo.project),
            counterpartyLabel: vo.project.clientName,
            status: vo.status,
            version: 1,
            createdAt: vo.createdAt,
            sentAt: null,
            viewedAt: null,
            signedAt: vo.approvedAt ?? null,
            expiresAt: null,
            signatureStatus: null,
            secureLinkUrl: null,
            previewUrl: `/projects/${vo.projectId}/variations/${vo.id}`,
            printUrl: `/projects/${vo.projectId}/variations/${vo.id}/print`,
          })),
        ),
    );
  }

  const raw = (await Promise.all(queries)).flat();
  raw.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const base = raw.slice(0, take);

  // Client viewer policy: hide drafts and internal-only docs.
  const filteredForViewer = isClientViewer(params.user)
    ? base.filter((r) => {
        if (r.kind === "QUOTATION") return ["SENT", "APPROVED"].includes(r.status);
        if (r.kind === "CONTRACT") return ["SENT", "PARTIALLY_SIGNED", "SIGNED"].includes(r.status);
        if (r.kind === "INVOICE") return ["SENT", "VIEWED", "PARTIALLY_PAID", "PAID", "OVERDUE"].includes(r.status);
        if (r.kind === "DESIGN_PRESENTATION") return ["READY", "SENT", "ARCHIVED"].includes(r.status);
        if (r.kind === "VARIATION_ORDER") return ["PENDING_APPROVAL", "APPROVED", "INVOICED", "REJECTED"].includes(r.status);
        return false;
      })
    : base;

  const now = new Date();

  // Fetch latest active public links for supported doc types.
  const linkMap = new Map<string, { url: string; expiresAt: Date | null; viewedAt: Date | null; isActive: boolean }>();
  const docTypes = Array.from(
    new Set(
      filteredForViewer
        .map((r) => asPublicDocumentType(r.kind))
        .filter((dt): dt is Exclude<PublicDocumentType, "COLLECTION_REMINDER"> => dt !== null),
    ),
  ) as Exclude<PublicDocumentType, "COLLECTION_REMINDER">[];

  for (const dt of docTypes) {
    const ids = filteredForViewer.filter((r) => asPublicDocumentType(r.kind) === dt).map((r) => r.recordId);
    if (ids.length === 0) continue;
    const links = await prisma.publicDocumentLink.findMany({
      where: { documentType: dt, documentId: { in: ids } },
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(500, ids.length * 5),
    });
    for (const l of links) {
      const key = `${l.documentType}:${l.documentId}`;
      if (linkMap.has(key)) continue;
      const url = buildPublicUrlForDocument({ documentType: l.documentType, token: l.token });
      linkMap.set(key, { url, expiresAt: l.expiresAt ?? null, viewedAt: l.viewedAt ?? null, isActive: l.isActive });
    }
  }

  // Fetch outbound messages for send/view history.
  const msgMap = new Map<string, { sentAt: Date | null; viewedAt: Date | null }>();
  const relatedTypes = Array.from(new Set(filteredForViewer.map((r) => mapRelatedType(r.kind)).filter(Boolean))) as MessageRelatedType[];
  for (const rt of relatedTypes) {
    const ids = filteredForViewer.filter((r) => mapRelatedType(r.kind) === rt).map((r) => r.recordId);
    if (ids.length === 0) continue;
    const msgs = await prisma.outboundMessage.findMany({
      where: { relatedType: rt, relatedId: { in: ids } },
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(800, ids.length * 6),
      include: { publicDocumentLink: { select: { viewedAt: true, expiresAt: true, isActive: true } } },
    });
    for (const m of msgs) {
      const key = `${rt}:${m.relatedId}`;
      const existing = msgMap.get(key) ?? { sentAt: null, viewedAt: null };

      const sentAt = m.sentAt ?? null;
      const viewedAt = m.publicDocumentLink?.viewedAt ?? m.viewedAt ?? null;

      // Keep the most recent sent/viewed timestamps.
      const nextSent =
        sentAt && (!existing.sentAt || sentAt.getTime() > existing.sentAt.getTime()) ? sentAt : existing.sentAt;
      const nextViewed =
        viewedAt && (!existing.viewedAt || viewedAt.getTime() > existing.viewedAt.getTime()) ? viewedAt : existing.viewedAt;

      msgMap.set(key, { sentAt: nextSent, viewedAt: nextViewed });
    }
  }

  // Fetch signature requests (latest per doc).
  const sigMap = new Map<string, { status: SignatureRequestStatus; signedAt: Date | null; viewedAt: Date | null; sentAt: Date | null; expiresAt: Date | null }>();
  const sigTypes = Array.from(new Set(filteredForViewer.map((r) => mapSignatureType(r.kind)).filter(Boolean))) as SignatureDocumentType[];
  for (const st of sigTypes) {
    const ids = filteredForViewer.filter((r) => mapSignatureType(r.kind) === st).map((r) => r.recordId);
    if (ids.length === 0) continue;
    const sigs = await prisma.signatureRequest.findMany({
      where: { documentType: st, documentId: { in: ids } },
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(800, ids.length * 4),
      select: { documentId: true, status: true, signedAt: true, viewedAt: true, sentAt: true, expiresAt: true, createdAt: true },
    });
    for (const s of sigs) {
      const key = `${st}:${s.documentId}`;
      if (sigMap.has(key)) continue;
      sigMap.set(key, {
        status: s.status,
        signedAt: s.signedAt ?? null,
        viewedAt: s.viewedAt ?? null,
        sentAt: s.sentAt ?? null,
        expiresAt: s.expiresAt ?? null,
      });
    }
  }

  const enriched = filteredForViewer.map((row) => {
    const relatedType = mapRelatedType(row.kind);
    const relatedKey = relatedType ? `${relatedType}:${row.recordId}` : null;
    const msg = relatedKey ? msgMap.get(relatedKey) : null;

    const publicType = asPublicDocumentType(row.kind);
    const publicKey = publicType ? `${publicType}:${row.recordId}` : null;
    const link = publicKey ? linkMap.get(publicKey) : null;

    const sigType = mapSignatureType(row.kind);
    const sigKey = sigType ? `${sigType}:${row.recordId}` : null;
    const sig = sigKey ? sigMap.get(sigKey) : null;

    const sentAt = msg?.sentAt ?? sig?.sentAt ?? null;
    const viewedAt = msg?.viewedAt ?? sig?.viewedAt ?? link?.viewedAt ?? null;
    const expiresAt = sig?.expiresAt ?? link?.expiresAt ?? null;
    const signedAt = row.signedAt ?? sig?.signedAt ?? null;
    const signatureStatus: DocumentRegisterRow["signatureStatus"] =
      sig?.status ??
      (row.kind === "CONTRACT" && isSignedStatus(row.status) ? ("SIGNED" as SignatureRequestStatus) : null) ??
      (row.kind === "VARIATION_ORDER" && ["APPROVED", "INVOICED"].includes(row.status)
        ? ("SIGNED" as SignatureRequestStatus)
        : null) ??
      (row.kind === "VARIATION_ORDER" && row.status === "REJECTED"
        ? ("REJECTED" as SignatureRequestStatus)
        : null) ??
      "UNSIGNED";
    const secureLinkUrl = link?.url ?? null;

    return {
      ...row,
      sentAt,
      viewedAt,
      signedAt,
      expiresAt,
      signatureStatus,
      secureLinkUrl,
    };
  });

  const fullyFiltered = enriched.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.signed === "signed" && r.signatureStatus !== "SIGNED") return false;
    if (filters.signed === "unsigned" && r.signatureStatus === "SIGNED") return false;
    if (filters.sent === "sent" && !r.sentAt) return false;
    if (filters.sent === "not_sent" && r.sentAt) return false;
    if (filters.expiredLinks === "expired") {
      if (!r.expiresAt) return false;
      if (r.expiresAt.getTime() > now.getTime()) return false;
    }
    if (filters.expiredLinks === "active") {
      if (!r.expiresAt) return false;
      if (r.expiresAt.getTime() <= now.getTime()) return false;
    }
    return true;
  });

  return fullyFiltered;
}
