import "server-only";

import { requireUser, type SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/rbac";

const VIEW_ROLES = new Set(["ADMIN", "DIRECTOR", "PROJECT_MANAGER", "QS", "FINANCE"]);
const EDIT_ROLES = new Set(["ADMIN", "DIRECTOR"]);

export function canViewBizsafeModule(user: SessionUser): boolean {
  return user.roleKeys.some((roleKey) => VIEW_ROLES.has(roleKey));
}

export function canEditBizsafeModule(user: SessionUser): boolean {
  return user.roleKeys.some((roleKey) => EDIT_ROLES.has(roleKey));
}

export async function requireBizsafeViewAccess() {
  const user = await requireUser();
  if (!canViewBizsafeModule(user)) {
    throw new ForbiddenError();
  }
  return user;
}

export async function requireBizsafeEditAccess() {
  const user = await requireUser();
  if (!canEditBizsafeModule(user)) {
    throw new ForbiddenError();
  }
  return user;
}

