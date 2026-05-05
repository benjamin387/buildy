"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { auditLog } from "@/lib/audit";
import { DEFAULT_PERMISSION_RULES_BY_ROLE } from "@/lib/auth/permission-defaults";
import { PERMISSION_MODULE_KEYS } from "@/lib/auth/permission-keys";
import { permissionToModuleAccessKey } from "@/lib/auth/module-access-mapping";

const RoleKeySchema = z.string().min(1).max(64);

function boolFromForm(formData: FormData, key: string): boolean {
  return String(formData.get(key) ?? "") === "on";
}

export async function saveRolePermissionMatrixAction(formData: FormData) {
  const actor = await requireExecutive();

  const roleKey = RoleKeySchema.parse(String(formData.get("roleKey") ?? ""));

  const updates = PERMISSION_MODULE_KEYS.map((moduleKey) => {
    const prefix = `${moduleKey}__`;
    return {
      roleKey,
      moduleKey,
      canView: boolFromForm(formData, `${prefix}canView`),
      canCreate: boolFromForm(formData, `${prefix}canCreate`),
      canEdit: boolFromForm(formData, `${prefix}canEdit`),
      canDelete: boolFromForm(formData, `${prefix}canDelete`),
      canApprove: boolFromForm(formData, `${prefix}canApprove`),
      canSend: boolFromForm(formData, `${prefix}canSend`),
      canExport: boolFromForm(formData, `${prefix}canExport`),
    };
  });

  const before = await prisma.permissionRule.findMany({ where: { roleKey } }).catch(() => []);

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.permissionRule.upsert({
        where: { roleKey_moduleKey: { roleKey: u.roleKey, moduleKey: u.moduleKey } },
        create: u,
        update: {
          canView: u.canView,
          canCreate: u.canCreate,
          canEdit: u.canEdit,
          canDelete: u.canDelete,
          canApprove: u.canApprove,
          canSend: u.canSend,
          canExport: u.canExport,
        },
      });

      const mappedModuleKeys = permissionToModuleAccessKey(u.moduleKey);
      for (const moduleKey of mappedModuleKeys) {
        await tx.roleModuleAccess.upsert({
          where: { role_moduleKey: { role: u.roleKey, moduleKey } },
          create: {
            role: u.roleKey,
            moduleKey,
            canView: u.canView,
            canCreate: u.canCreate,
            canEdit: u.canEdit,
            canDelete: u.canDelete,
          },
          update: {
            canView: u.canView,
            canCreate: u.canCreate,
            canEdit: u.canEdit,
            canDelete: u.canDelete,
          },
        });
      }
    }
  });

  const after = await prisma.permissionRule.findMany({ where: { roleKey } }).catch(() => []);

  const beforeMap = new Map(before.map((r) => [`${r.moduleKey}`, r]));
  const changedModules: Array<{ moduleKey: string; before: any; after: any }> = [];
  for (const r of after) {
    const b = beforeMap.get(`${r.moduleKey}`);
    const beforeShape = b
      ? {
          canView: b.canView,
          canCreate: b.canCreate,
          canEdit: b.canEdit,
          canDelete: b.canDelete,
          canApprove: b.canApprove,
          canSend: b.canSend,
          canExport: b.canExport,
        }
      : null;
    const afterShape = {
      canView: r.canView,
      canCreate: r.canCreate,
      canEdit: r.canEdit,
      canDelete: r.canDelete,
      canApprove: r.canApprove,
      canSend: r.canSend,
      canExport: r.canExport,
    };
    if (JSON.stringify(beforeShape) !== JSON.stringify(afterShape)) {
      changedModules.push({ moduleKey: String(r.moduleKey), before: beforeShape, after: afterShape });
    }
  }

  await auditLog({
    module: "security",
    action: "permission_rule_update",
    actorUserId: actor.id,
    projectId: null,
    entityType: "PermissionRule",
    entityId: roleKey,
    metadata: {
      roleKey,
      beforeCount: before.length,
      afterCount: after.length,
      changedModules: changedModules.slice(0, 200),
    },
  });

  revalidatePath("/settings/permissions");
}

export async function resetRolePermissionMatrixAction(formData: FormData) {
  const actor = await requireExecutive();
  const roleKey = RoleKeySchema.parse(String(formData.get("roleKey") ?? ""));

  const before = await prisma.permissionRule.findMany({ where: { roleKey } }).catch(() => []);

  const defaults = DEFAULT_PERMISSION_RULES_BY_ROLE[roleKey] ?? null;
  if (!defaults) {
    // Unknown role key: clear only.
    await prisma.permissionRule.deleteMany({ where: { roleKey } });
    await prisma.roleModuleAccess.deleteMany({ where: { role: roleKey } });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.permissionRule.deleteMany({ where: { roleKey } });
      await tx.roleModuleAccess.deleteMany({ where: { role: roleKey } });
      for (const d of defaults) {
        await tx.permissionRule.create({
          data: {
            roleKey,
            moduleKey: d.moduleKey,
            canView: d.canView,
            canCreate: d.canCreate,
            canEdit: d.canEdit,
            canDelete: d.canDelete,
            canApprove: d.canApprove,
            canSend: d.canSend,
            canExport: d.canExport,
          },
        });

        const mappedModuleKeys = permissionToModuleAccessKey(d.moduleKey);
        for (const moduleKey of mappedModuleKeys) {
          await tx.roleModuleAccess.create({
            data: {
              role: roleKey,
              moduleKey,
              canView: d.canView,
              canCreate: d.canCreate,
              canEdit: d.canEdit,
              canDelete: d.canDelete,
            },
          });
        }
      }
    });
  }

  await auditLog({
    module: "security",
    action: "permission_rule_reset",
    actorUserId: actor.id,
    projectId: null,
    entityType: "PermissionRule",
    entityId: roleKey,
    metadata: { roleKey, deletedCount: before.length },
  });

  revalidatePath("/settings/permissions");
}
