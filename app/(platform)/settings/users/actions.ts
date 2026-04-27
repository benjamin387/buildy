"use server";

import { z } from "zod";
import { PermissionLevel, PlatformModule, UserStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/rbac/admin";
import { ROLE_DEFINITIONS, type AppRoleKey } from "@/lib/rbac/permissions";
import { hashPassword } from "@/lib/security/password";
import { auditLog } from "@/lib/audit";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toStatus(isActive: boolean): UserStatus {
  return isActive ? UserStatus.ACTIVE : UserStatus.DISABLED;
}

const moduleKeys = Object.values(PlatformModule);

function permissionLevelFromForm(formData: FormData, module: PlatformModule): PermissionLevel {
  const key = `perm_${module}`;
  const raw = String(formData.get(key) ?? "");
  if (!raw) return PermissionLevel.NONE;
  if (!Object.values(PermissionLevel).includes(raw as PermissionLevel)) return PermissionLevel.NONE;
  return raw as PermissionLevel;
}

async function upsertRoleByKey(key: AppRoleKey) {
  const def = ROLE_DEFINITIONS.find((r) => r.key === key);
  if (!def) throw new Error("Invalid role.");

  return prisma.role.upsert({
    where: { key: def.key },
    create: {
      key: def.key,
      name: def.name,
      description: def.description,
      permissions: def.permissions,
    },
    update: {
      name: def.name,
      description: def.description,
      permissions: def.permissions,
    },
  });
}

const createUserSchema = z.object({
  name: z.string().max(140).optional().or(z.literal("")).default(""),
  email: z.string().email(),
  tempPassword: z.string().min(8).max(72),
  roleKey: z.string().min(1),
  isActive: z.enum(["on"]).optional(),
});

export async function createUserAction(formData: FormData) {
  const admin = await requirePlatformAdmin();

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    tempPassword: formData.get("tempPassword"),
    roleKey: formData.get("roleKey"),
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) {
    throw new Error("Invalid user details.");
  }

  const email = normalizeEmail(parsed.data.email);
  const roleKey = parsed.data.roleKey as AppRoleKey;
  if (!ROLE_DEFINITIONS.some((r) => r.key === roleKey)) throw new Error("Invalid role.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email already exists.");

  const digest = await hashPassword(parsed.data.tempPassword);
  const status = toStatus(Boolean(parsed.data.isActive));

  const role = await upsertRoleByKey(roleKey);
  const permissions = moduleKeys.map((m) => ({
    module: m,
    level: permissionLevelFromForm(formData, m),
  }));

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name: parsed.data.name || null,
        passwordHash: digest.hashBase64,
        passwordSalt: digest.saltBase64,
        status,
      },
      select: { id: true },
    });

    await tx.userRole.create({
      data: {
        userId: created.id,
        roleId: role.id,
      },
    });

    await tx.userModulePermission.createMany({
      data: permissions.map((p) => ({
        userId: created.id,
        module: p.module,
        level: p.level,
      })),
      skipDuplicates: true,
    });

    return created;
  });

  await auditLog({
    module: "security",
    action: "user_create",
    actorUserId: admin.id,
    projectId: null,
    entityType: "User",
    entityId: user.id,
    metadata: { email, roleKey, status },
  });

  revalidatePath("/settings/users");
  redirect("/settings/users");
}

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().max(140).optional().or(z.literal("")).default(""),
  email: z.string().email(),
  roleKey: z.string().min(1),
  isActive: z.enum(["on"]).optional(),
  resetPassword: z.string().max(72).optional().or(z.literal("")).default(""),
});

async function countActiveAdmins(excludeUserId?: string) {
  const admins = await prisma.userRole.findMany({
    where: { role: { key: "ADMIN" } },
    select: { user: { select: { id: true, status: true } } },
  });
  return admins.filter((a) => a.user.status === "ACTIVE" && a.user.id !== excludeUserId).length;
}

export async function updateUserAction(formData: FormData) {
  const admin = await requirePlatformAdmin();

  const parsed = updateUserSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    email: formData.get("email"),
    roleKey: formData.get("roleKey"),
    isActive: formData.get("isActive"),
    resetPassword: formData.get("resetPassword"),
  });
  if (!parsed.success) throw new Error("Invalid update request.");

  const userId = parsed.data.userId;
  const email = normalizeEmail(parsed.data.email);
  const roleKey = parsed.data.roleKey as AppRoleKey;
  if (!ROLE_DEFINITIONS.some((r) => r.key === roleKey)) throw new Error("Invalid role.");

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      modulePermissions: true,
    },
  });
  if (!existing) throw new Error("User not found.");

  const emailOwner = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (emailOwner && emailOwner.id !== userId) throw new Error("Email already exists.");

  const nextStatus = toStatus(Boolean(parsed.data.isActive));
  const hadAdminRole = existing.roles.some((r) => r.role.key === "ADMIN");
  const willBeAdmin = roleKey === "ADMIN";
  const willBeActive = nextStatus === "ACTIVE";

  if (hadAdminRole && (!willBeAdmin || !willBeActive)) {
    const remaining = await countActiveAdmins(userId);
    if (remaining === 0) {
      throw new Error("You cannot deactivate or remove the last active ADMIN user.");
    }
  }

  const role = await upsertRoleByKey(roleKey);
  const modulePerms = moduleKeys.map((m) => ({
    module: m,
    level: permissionLevelFromForm(formData, m),
  }));

  const passwordDigest = parsed.data.resetPassword
    ? await hashPassword(parsed.data.resetPassword)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email,
        name: parsed.data.name || null,
        status: nextStatus,
        ...(passwordDigest
          ? { passwordHash: passwordDigest.hashBase64, passwordSalt: passwordDigest.saltBase64 }
          : {}),
      },
    });

    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.create({
      data: {
        userId,
        roleId: role.id,
      },
    });

    for (const p of modulePerms) {
      await tx.userModulePermission.upsert({
        where: { userId_module: { userId, module: p.module } },
        create: { userId, module: p.module, level: p.level },
        update: { level: p.level },
      });
    }
  });

  await auditLog({
    module: "security",
    action: "user_update",
    actorUserId: admin.id,
    projectId: null,
    entityType: "User",
    entityId: userId,
    metadata: { email, roleKey, status: nextStatus, passwordReset: Boolean(passwordDigest) },
  });

  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
  redirect(`/settings/users/${userId}`);
}

