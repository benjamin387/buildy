import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { MODULE_ACCESS_KEYS, type ModuleAccessKey } from "@/lib/auth/module-access-keys";
import type { CurrentUserAccess, ModuleAccessFlags, ModuleAccessMatrix } from "@/lib/auth/module-access-shared";

const EMPTY_FLAGS: ModuleAccessFlags = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
};

function cloneEmptyMatrix(): ModuleAccessMatrix {
  return MODULE_ACCESS_KEYS.reduce((acc, key) => {
    acc[key] = { ...EMPTY_FLAGS };
    return acc;
  }, {} as ModuleAccessMatrix);
}

function mergeAccess(base: ModuleAccessFlags, incoming: ModuleAccessFlags) {
  base.canView = base.canView || incoming.canView;
  base.canCreate = base.canCreate || incoming.canCreate;
  base.canEdit = base.canEdit || incoming.canEdit;
  base.canDelete = base.canDelete || incoming.canDelete;
}

function matrixAllowAll(): ModuleAccessMatrix {
  return MODULE_ACCESS_KEYS.reduce((acc, key) => {
    acc[key] = { canView: true, canCreate: true, canEdit: true, canDelete: true };
    return acc;
  }, {} as ModuleAccessMatrix);
}

export async function getCurrentUserAccess(): Promise<CurrentUserAccess> {
  const user = await requireUser();

  if (user.isAdmin) {
    return {
      isAdmin: true,
      matrix: matrixAllowAll(),
    };
  }

  const matrix = cloneEmptyMatrix();

  const roleRows = await prisma.roleModuleAccess.findMany({
    where: {
      role: { in: user.roleKeys },
      moduleKey: { in: [...MODULE_ACCESS_KEYS] },
    },
    select: {
      moduleKey: true,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    },
  });

  for (const row of roleRows) {
    const key = row.moduleKey as ModuleAccessKey;
    if (!MODULE_ACCESS_KEYS.includes(key)) continue;
    mergeAccess(matrix[key], {
      canView: row.canView,
      canCreate: row.canCreate,
      canEdit: row.canEdit,
      canDelete: row.canDelete,
    });
  }

  const userRows = await prisma.userModuleAccess.findMany({
    where: {
      userId: user.id,
      moduleKey: { in: [...MODULE_ACCESS_KEYS] },
    },
    select: {
      moduleKey: true,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    },
  });

  // User-level rows override role-level rows for a module when present.
  for (const row of userRows) {
    const key = row.moduleKey as ModuleAccessKey;
    if (!MODULE_ACCESS_KEYS.includes(key)) continue;
    matrix[key] = {
      canView: row.canView,
      canCreate: row.canCreate,
      canEdit: row.canEdit,
      canDelete: row.canDelete,
    };
  }

  return {
    isAdmin: false,
    matrix,
  };
}

export async function canViewModule(moduleKey: ModuleAccessKey): Promise<boolean> {
  const access = await getCurrentUserAccess();
  return access.isAdmin || access.matrix[moduleKey].canView;
}

export async function canCreateModule(moduleKey: ModuleAccessKey): Promise<boolean> {
  const access = await getCurrentUserAccess();
  return access.isAdmin || access.matrix[moduleKey].canCreate;
}

export async function canEditModule(moduleKey: ModuleAccessKey): Promise<boolean> {
  const access = await getCurrentUserAccess();
  return access.isAdmin || access.matrix[moduleKey].canEdit;
}

export async function canDeleteModule(moduleKey: ModuleAccessKey): Promise<boolean> {
  const access = await getCurrentUserAccess();
  return access.isAdmin || access.matrix[moduleKey].canDelete;
}

export async function requireModuleAccess(
  moduleKey: ModuleAccessKey,
  action: "view" | "create" | "edit" | "delete" = "view",
) {
  const access = await getCurrentUserAccess();

  if (access.isAdmin) return access;

  const allowed =
    action === "view"
      ? access.matrix[moduleKey].canView
      : action === "create"
        ? access.matrix[moduleKey].canCreate
        : action === "edit"
          ? access.matrix[moduleKey].canEdit
          : access.matrix[moduleKey].canDelete;

  if (!allowed) {
    redirect(`/access-denied?module=${moduleKey}&action=${action}`);
  }

  return access;
}
