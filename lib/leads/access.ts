import "server-only";

import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/rbac";

function isSupplierOrClient(user: SessionUser): boolean {
  return user.roleKeys.includes("SUPPLIER") || user.roleKeys.includes("CLIENT_VIEWER");
}

export function canAccessLeadsModule(user: SessionUser): boolean {
  if (user.isAdmin || user.roleKeys.includes("DIRECTOR")) return true;
  if (isSupplierOrClient(user)) return Boolean(user.canSubmitLeads);
  return true;
}

export function requireLeadsModuleAccess(user: SessionUser): void {
  if (!canAccessLeadsModule(user)) {
    throw new ForbiddenError();
  }
}

export function canSubmitLead(user: SessionUser): boolean {
  if (!user.canSubmitLeads) return false;
  if (isSupplierOrClient(user)) return true; // explicitly allowed via canSubmitLeads
  return true;
}

export function requireLeadSubmissionAccess(user: SessionUser): void {
  if (!canSubmitLead(user)) {
    throw new ForbiddenError("Lead submission disabled for this account.");
  }
}

export function buildLeadVisibilityWhere(user: SessionUser): Prisma.LeadWhereInput {
  // Admin/Director: full visibility
  if (user.isAdmin || user.roleKeys.includes("DIRECTOR")) {
    return {};
  }

  // Project Manager: assigned + submitted
  if (user.roleKeys.includes("PROJECT_MANAGER")) {
    return {
      OR: [{ assignedToUserId: user.id }, { submittedByUserId: user.id }],
    };
  }

  // Everyone else: only what they submitted (including supplier/client viewers when allowed)
  return { submittedByUserId: user.id };
}

