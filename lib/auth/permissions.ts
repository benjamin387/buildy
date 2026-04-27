import "server-only";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/rbac";
import { DEFAULT_PERMISSION_RULES_BY_ROLE } from "@/lib/auth/permission-defaults";
import { can as canShared, EMPTY_PERMISSION, type ModulePermission, type PermissionAction, type PermissionMatrix } from "@/lib/auth/permissions-shared";
import { PERMISSION_MODULE_KEYS, type PermissionModuleKey } from "@/lib/auth/permission-keys";

type PermissionRuleRow = {
  roleKey: string;
  moduleKey: PermissionModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canSend: boolean;
  canExport: boolean;
};

const EMPTY = EMPTY_PERMISSION;

function allowAll(): ModulePermission {
  return {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canApprove: true,
    canSend: true,
    canExport: true,
  };
}

function cloneEmptyMatrix(): PermissionMatrix {
  return PERMISSION_MODULE_KEYS.reduce((acc, m) => {
    acc[m] = { ...EMPTY };
    return acc;
  }, {} as PermissionMatrix);
}

function mergeInto(target: ModulePermission, rule: PermissionRuleRow) {
  target.canView = target.canView || Boolean(rule.canView);
  target.canCreate = target.canCreate || Boolean(rule.canCreate);
  target.canEdit = target.canEdit || Boolean(rule.canEdit);
  target.canDelete = target.canDelete || Boolean(rule.canDelete);
  target.canApprove = target.canApprove || Boolean(rule.canApprove);
  target.canSend = target.canSend || Boolean(rule.canSend);
  target.canExport = target.canExport || Boolean(rule.canExport);
}

function getPermissionRuleDelegate() {
  const prismaAny = prisma as unknown as Record<string, any>;
  const d = prismaAny.permissionRule;
  if (!d || typeof d.findMany !== "function") return null;
  return d as {
    findMany: (args: any) => Promise<PermissionRuleRow[]>;
  };
}

export async function getRolePermissions(roleKey: string): Promise<PermissionMatrix> {
  const matrix = cloneEmptyMatrix();
  const role = roleKey.trim();
  if (!role) return matrix;

  try {
    const delegate = getPermissionRuleDelegate();
    const rows = delegate ? await delegate.findMany({ where: { roleKey: role } }) : [];

    const defaults = DEFAULT_PERMISSION_RULES_BY_ROLE[role] ?? [];
    const dbModuleKeys = new Set<PermissionModuleKey>();

    // Apply DB rules first (these are explicit overrides).
    for (const r of rows) {
      const moduleKey = (r as any).moduleKey as PermissionModuleKey;
      if (!moduleKey) continue;
      dbModuleKeys.add(moduleKey);
      mergeInto(matrix[moduleKey], r as any);
    }

    // For modules not present in DB yet (e.g. newly added module keys),
    // fall back to code defaults so upgrades don't silently deny access.
    for (const d of defaults) {
      if (dbModuleKeys.has(d.moduleKey)) continue;
      mergeInto(matrix[d.moduleKey], d as any);
    }
  } catch {
    // If Prisma Client/schema isn't aligned yet, keep safe deny-by-default.
  }

  return matrix;
}

export async function getUserPermissionsMatrix(user: { roleKeys: string[]; isAdmin: boolean }) {
  if (user.isAdmin) {
    return PERMISSION_MODULE_KEYS.reduce((acc, m) => {
      acc[m] = allowAll();
      return acc;
    }, {} as PermissionMatrix);
  }

  const matrix = cloneEmptyMatrix();
  const roleKeys = (user.roleKeys ?? []).map((r) => r.trim()).filter(Boolean);
  if (roleKeys.length === 0) return matrix;

  const delegate = getPermissionRuleDelegate();
  const rows = await (delegate
    ? delegate.findMany({ where: { roleKey: { in: roleKeys } } }).catch(() => [] as PermissionRuleRow[])
    : Promise.resolve([] as PermissionRuleRow[]));

  const dbByRole = new Map<string, Set<PermissionModuleKey>>();
  for (const r of rows) {
    if (!dbByRole.has(r.roleKey)) dbByRole.set(r.roleKey, new Set());
    dbByRole.get(r.roleKey)!.add(r.moduleKey);
    mergeInto(matrix[r.moduleKey], r);
  }

  // For each user role, apply defaults only for modules that aren't present in DB.
  // This ensures newly added modules work without forcing a reseed, while still
  // respecting explicit DB rules when they exist.
  for (const roleKey of roleKeys) {
    const defaults = DEFAULT_PERMISSION_RULES_BY_ROLE[roleKey] ?? [];
    const present = dbByRole.get(roleKey) ?? new Set<PermissionModuleKey>();
    for (const d of defaults) {
      if (present.has(d.moduleKey)) continue;
      mergeInto(matrix[d.moduleKey], d as any);
    }
  }

  return matrix;
}

export function can(matrix: PermissionMatrix, moduleKey: PermissionModuleKey, action: PermissionAction): boolean {
  return canShared(matrix, moduleKey, action);
}

export async function requirePermission(params: { moduleKey: PermissionModuleKey; action: PermissionAction }) {
  const user = await requireUser();
  if (user.isAdmin) return { user, matrix: await getUserPermissionsMatrix(user) };

  const matrix = await getUserPermissionsMatrix(user);
  if (!can(matrix, params.moduleKey, params.action)) {
    throw new ForbiddenError();
  }

  return { user, matrix };
}
