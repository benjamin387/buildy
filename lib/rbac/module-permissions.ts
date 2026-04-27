import "server-only";

import { PermissionLevel, PlatformModule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/rbac";

const LEVEL_RANK: Record<PermissionLevel, number> = {
  NONE: 0,
  VIEW: 1,
  EDIT: 2,
  APPROVE: 3,
  ADMIN: 4,
};

function hasAtLeast(level: PermissionLevel, minimumLevel: PermissionLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minimumLevel];
}

async function isAdminUser(userId: string): Promise<boolean> {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    select: { role: { select: { key: true } } },
  });
  return roles.some((r) => r.role.key === "ADMIN");
}

export async function getUserModulePermissions(
  userId: string,
): Promise<Record<PlatformModule, PermissionLevel>> {
  if (await isAdminUser(userId)) {
    return Object.fromEntries(
      Object.values(PlatformModule).map((m) => [m, PermissionLevel.ADMIN]),
    ) as Record<PlatformModule, PermissionLevel>;
  }

  const rows = await prisma.userModulePermission.findMany({
    where: { userId },
    select: { module: true, level: true },
  });

  const result = Object.fromEntries(
    Object.values(PlatformModule).map((m) => [m, PermissionLevel.NONE]),
  ) as Record<PlatformModule, PermissionLevel>;

  for (const row of rows) {
    result[row.module] = row.level;
  }

  return result;
}

export async function canViewModule(userId: string, module: PlatformModule): Promise<boolean> {
  const perms = await getUserModulePermissions(userId);
  const level = perms[module] ?? PermissionLevel.NONE;
  return hasAtLeast(level, PermissionLevel.VIEW);
}

export async function canEditModule(userId: string, module: PlatformModule): Promise<boolean> {
  const perms = await getUserModulePermissions(userId);
  const level = perms[module] ?? PermissionLevel.NONE;
  return hasAtLeast(level, PermissionLevel.EDIT);
}

export async function requireModuleAccess(module: PlatformModule, minimumLevel: PermissionLevel) {
  const user = await requireUser();
  if (user.isAdmin) return user;

  const perms = await getUserModulePermissions(user.id);
  const level = perms[module] ?? PermissionLevel.NONE;
  if (!hasAtLeast(level, minimumLevel)) {
    throw new ForbiddenError();
  }

  return user;
}

