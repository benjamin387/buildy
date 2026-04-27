import "server-only";

import { Permission, PublicDocumentType } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/rbac";

export type DocumentKind =
  | "DESIGN_PRESENTATION"
  | "QUOTATION"
  | "CONTRACT"
  | "INVOICE"
  | "PURCHASE_ORDER"
  | "SUBCONTRACT"
  | "SUPPLIER_BILL"
  | "VARIATION_ORDER"
  | "HANDOVER_FORM";

export const DOCUMENT_KINDS: DocumentKind[] = [
  "DESIGN_PRESENTATION",
  "QUOTATION",
  "CONTRACT",
  "INVOICE",
  "PURCHASE_ORDER",
  "SUBCONTRACT",
  "SUPPLIER_BILL",
  "VARIATION_ORDER",
  "HANDOVER_FORM",
];

export function asPublicDocumentType(kind: DocumentKind): PublicDocumentType | null {
  if (
    kind === "DESIGN_PRESENTATION" ||
    kind === "QUOTATION" ||
    kind === "CONTRACT" ||
    kind === "INVOICE" ||
    kind === "VARIATION_ORDER" ||
    kind === "PURCHASE_ORDER" ||
    kind === "SUBCONTRACT" ||
    kind === "SUPPLIER_BILL"
  ) {
    return kind satisfies Exclude<PublicDocumentType, "COLLECTION_REMINDER"> as PublicDocumentType;
  }
  return null;
}

export function requireDocumentCenterAccess(user: SessionUser) {
  // Allow if the user can see at least one document-producing module.
  const allowed = [
    Permission.PROJECT_READ,
    Permission.QUOTE_READ,
    Permission.CONTRACT_READ,
    Permission.INVOICE_READ,
    Permission.SUPPLIER_READ,
    Permission.SUBCONTRACT_READ,
    Permission.PNL_READ,
    Permission.COMMS_READ,
  ].some((p) => user.permissions.includes(p));

  if (!allowed) throw new ForbiddenError();

  return user;
}

export function getAllowedDocumentKinds(user: SessionUser): Set<DocumentKind> {
  if (user.isAdmin || user.roleKeys.includes("DIRECTOR")) {
    return new Set(DOCUMENT_KINDS);
  }

  const s = new Set<DocumentKind>();
  if (user.permissions.includes(Permission.PROJECT_READ)) s.add("DESIGN_PRESENTATION");
  if (user.permissions.includes(Permission.QUOTE_READ)) s.add("QUOTATION");
  if (user.permissions.includes(Permission.CONTRACT_READ)) s.add("CONTRACT");
  if (user.permissions.includes(Permission.INVOICE_READ)) s.add("INVOICE");
  if (user.permissions.includes(Permission.QUOTE_READ)) s.add("VARIATION_ORDER");
  if (user.permissions.includes(Permission.SUPPLIER_READ)) {
    s.add("PURCHASE_ORDER");
    s.add("SUPPLIER_BILL");
  }
  if (user.permissions.includes(Permission.SUBCONTRACT_READ)) s.add("SUBCONTRACT");
  if (user.permissions.includes(Permission.PNL_READ)) s.add("VARIATION_ORDER");

  // Handover form not implemented yet; keep for future.
  return s;
}

export function isClientViewer(user: SessionUser): boolean {
  return !user.isAdmin && user.roleKeys.includes("CLIENT_VIEWER");
}
