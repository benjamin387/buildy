"use server";

import { z } from "zod";
import { DesignStyle, Permission, PropertyType, RoomType, ScopeCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  addRoomBoqTemplateItem,
  createDesignPackage,
  createRoomTemplate,
  deleteRoomBoqTemplateItem,
  updateDesignPackage,
  updateRoomBoqTemplateItem,
  updateRoomTemplate,
} from "@/lib/design-packages/service";
import { seedDesignPackageDefaults } from "@/lib/design-packages/seed";
import { toRevisionJson } from "@/lib/audit/serialize";

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

const packageSchema = z.object({
  packageId: z.string().optional().or(z.literal("")).default(""),
  packageCode: z.string().min(2).max(40),
  name: z.string().min(1).max(140),
  description: z.string().optional().or(z.literal("")).default(""),
  propertyType: z.nativeEnum(PropertyType),
  designStyle: z.nativeEnum(DesignStyle).optional().or(z.literal("")).default(""),
  estimatedBudgetMin: z.coerce.number().optional().default(NaN),
  estimatedBudgetMax: z.coerce.number().optional().default(NaN),
  isActive: z.coerce.boolean().optional().default(true),
});

export async function createDesignPackageAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE });

  const parsed = packageSchema.safeParse({
    packageCode: formData.get("packageCode"),
    name: formData.get("name"),
    description: formData.get("description"),
    propertyType: formData.get("propertyType"),
    designStyle: formData.get("designStyle"),
    estimatedBudgetMin: formData.get("estimatedBudgetMin"),
    estimatedBudgetMax: formData.get("estimatedBudgetMax"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) throw new Error("Invalid design package.");

  const min = Number.isFinite(parsed.data.estimatedBudgetMin) ? clampNonNegative(parsed.data.estimatedBudgetMin) : null;
  const max = Number.isFinite(parsed.data.estimatedBudgetMax) ? clampNonNegative(parsed.data.estimatedBudgetMax) : null;

  const created = await createDesignPackage({
    packageCode: parsed.data.packageCode,
    name: parsed.data.name,
    description: parsed.data.description || null,
    propertyType: parsed.data.propertyType,
    designStyle: parsed.data.designStyle ? (parsed.data.designStyle as DesignStyle) : null,
    estimatedBudgetMin: min,
    estimatedBudgetMax: max,
    isActive: parsed.data.isActive,
  });

  await auditLog({
    module: "design_package",
    action: "create",
    actorUserId: userId,
    projectId: null,
    entityType: "DesignPackage",
    entityId: created.id,
    metadata: { packageCode: created.packageCode, name: created.name },
  });
  await createRevision({
    entityType: "DesignPackage",
    entityId: created.id,
    projectId: null,
    actorUserId: userId,
    note: "Design package created",
    data: toRevisionJson(created),
  });

  revalidatePath("/design-packages");
  redirect(`/design-packages/${created.id}`);
}

export async function updateDesignPackageAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE });

  const parsed = packageSchema.safeParse({
    packageId: formData.get("packageId"),
    packageCode: formData.get("packageCode"),
    name: formData.get("name"),
    description: formData.get("description"),
    propertyType: formData.get("propertyType"),
    designStyle: formData.get("designStyle"),
    estimatedBudgetMin: formData.get("estimatedBudgetMin"),
    estimatedBudgetMax: formData.get("estimatedBudgetMax"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) throw new Error("Invalid design package.");
  if (!parsed.data.packageId) throw new Error("Missing package.");

  const min = Number.isFinite(parsed.data.estimatedBudgetMin) ? clampNonNegative(parsed.data.estimatedBudgetMin) : null;
  const max = Number.isFinite(parsed.data.estimatedBudgetMax) ? clampNonNegative(parsed.data.estimatedBudgetMax) : null;

  const updated = await updateDesignPackage({
    packageId: parsed.data.packageId,
    packageCode: parsed.data.packageCode,
    name: parsed.data.name,
    description: parsed.data.description || null,
    propertyType: parsed.data.propertyType,
    designStyle: parsed.data.designStyle ? (parsed.data.designStyle as DesignStyle) : null,
    estimatedBudgetMin: min,
    estimatedBudgetMax: max,
    isActive: parsed.data.isActive,
  });

  await auditLog({
    module: "design_package",
    action: "update",
    actorUserId: userId,
    projectId: null,
    entityType: "DesignPackage",
    entityId: updated.id,
    metadata: { packageCode: updated.packageCode, name: updated.name },
  });
  await createRevision({
    entityType: "DesignPackage",
    entityId: updated.id,
    projectId: null,
    actorUserId: userId,
    note: "Design package updated",
    data: toRevisionJson(updated),
  });

  revalidatePath(`/design-packages/${updated.id}`);
  redirect(`/design-packages/${updated.id}`);
}

const seedSchema = z.object({
  force: z.string().optional().or(z.literal("")).default(""),
});

export async function seedDesignPackagesAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE });
  const parsed = seedSchema.safeParse({ force: formData.get("force") });
  if (!parsed.success) throw new Error("Invalid request.");

  const force = parsed.data.force === "on";
  const result = await seedDesignPackageDefaults({ force });

  await auditLog({
    module: "design_package",
    action: "seed_defaults",
    actorUserId: userId,
    projectId: null,
    entityType: "DesignPackageSeed",
    entityId: "defaults",
    metadata: result,
  });

  revalidatePath("/design-packages");
  redirect("/design-packages");
}

const roomSchema = z.object({
  designPackageId: z.string().min(1),
  roomTemplateId: z.string().optional().or(z.literal("")).default(""),
  roomCode: z.string().min(2).max(60),
  name: z.string().min(1).max(140),
  roomType: z.nativeEnum(RoomType),
  description: z.string().optional().or(z.literal("")).default(""),
  sortOrder: z.coerce.number().optional().default(0),
  isActive: z.coerce.boolean().optional().default(true),
});

export async function createRoomTemplateAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE });

  const parsed = roomSchema.safeParse({
    designPackageId: formData.get("designPackageId"),
    roomCode: formData.get("roomCode"),
    name: formData.get("name"),
    roomType: formData.get("roomType"),
    description: formData.get("description"),
    sortOrder: formData.get("sortOrder"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) throw new Error("Invalid room template.");

  const created = await createRoomTemplate({
    designPackageId: parsed.data.designPackageId,
    roomCode: parsed.data.roomCode,
    name: parsed.data.name,
    roomType: parsed.data.roomType,
    description: parsed.data.description || null,
    sortOrder: Number.isFinite(parsed.data.sortOrder) ? parsed.data.sortOrder : 0,
    isActive: parsed.data.isActive,
  });

  await auditLog({
    module: "design_package",
    action: "create_room",
    actorUserId: userId,
    projectId: null,
    entityType: "RoomTemplate",
    entityId: created.id,
    metadata: { designPackageId: created.designPackageId, roomCode: created.roomCode, name: created.name },
  });

  revalidatePath(`/design-packages/${parsed.data.designPackageId}`);
  redirect(`/design-packages/${parsed.data.designPackageId}/rooms/${created.id}`);
}

export async function updateRoomTemplateAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE });

  const parsed = roomSchema.safeParse({
    designPackageId: formData.get("designPackageId"),
    roomTemplateId: formData.get("roomTemplateId"),
    roomCode: formData.get("roomCode"),
    name: formData.get("name"),
    roomType: formData.get("roomType"),
    description: formData.get("description"),
    sortOrder: formData.get("sortOrder"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) throw new Error("Invalid room template.");
  if (!parsed.data.roomTemplateId) throw new Error("Missing room template.");

  const updated = await updateRoomTemplate({
    roomTemplateId: parsed.data.roomTemplateId,
    roomCode: parsed.data.roomCode,
    name: parsed.data.name,
    roomType: parsed.data.roomType,
    description: parsed.data.description || null,
    sortOrder: Number.isFinite(parsed.data.sortOrder) ? parsed.data.sortOrder : 0,
    isActive: parsed.data.isActive,
  });

  await auditLog({
    module: "design_package",
    action: "update_room",
    actorUserId: userId,
    projectId: null,
    entityType: "RoomTemplate",
    entityId: updated.id,
    metadata: { designPackageId: parsed.data.designPackageId, roomCode: updated.roomCode, name: updated.name },
  });

  revalidatePath(`/design-packages/${parsed.data.designPackageId}/rooms/${updated.id}`);
  redirect(`/design-packages/${parsed.data.designPackageId}/rooms/${updated.id}`);
}

const boqItemSchema = z.object({
  designPackageId: z.string().min(1),
  roomTemplateId: z.string().min(1),
  itemId: z.string().optional().or(z.literal("")).default(""),
  itemMasterId: z.string().optional().or(z.literal("")).default(""),
  sku: z.string().optional().or(z.literal("")).default(""),
  description: z.string().min(1).max(240),
  category: z.nativeEnum(ScopeCategory),
  unit: z.string().min(1).max(40),
  defaultQuantity: z.coerce.number().optional().default(0),
  defaultUnitPrice: z.coerce.number().optional().default(0),
  defaultCostPrice: z.coerce.number().optional().default(0),
  sortOrder: z.coerce.number().optional().default(0),
  isOptional: z.coerce.boolean().optional().default(false),
});

export async function addRoomBoqTemplateItemAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE });

  const parsed = boqItemSchema.safeParse({
    designPackageId: formData.get("designPackageId"),
    roomTemplateId: formData.get("roomTemplateId"),
    itemMasterId: formData.get("itemMasterId"),
    sku: formData.get("sku"),
    description: formData.get("description"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    defaultQuantity: formData.get("defaultQuantity"),
    defaultUnitPrice: formData.get("defaultUnitPrice"),
    defaultCostPrice: formData.get("defaultCostPrice"),
    sortOrder: formData.get("sortOrder"),
    isOptional: formData.get("isOptional") === "on",
  });
  if (!parsed.success) throw new Error("Invalid BOQ item.");

  const created = await addRoomBoqTemplateItem({
    roomTemplateId: parsed.data.roomTemplateId,
    itemMasterId: parsed.data.itemMasterId || null,
    sku: parsed.data.sku || null,
    description: parsed.data.description,
    category: parsed.data.category,
    unit: parsed.data.unit,
    defaultQuantity: clampNonNegative(parsed.data.defaultQuantity),
    defaultUnitPrice: clampNonNegative(parsed.data.defaultUnitPrice),
    defaultCostPrice: clampNonNegative(parsed.data.defaultCostPrice),
    sortOrder: Number.isFinite(parsed.data.sortOrder) ? parsed.data.sortOrder : undefined,
    isOptional: parsed.data.isOptional,
  });

  await auditLog({
    module: "design_package",
    action: "add_room_item",
    actorUserId: userId,
    projectId: null,
    entityType: "RoomBoqTemplateItem",
    entityId: created.id,
    metadata: { roomTemplateId: created.roomTemplateId, category: created.category, description: created.description },
  });

  revalidatePath(`/design-packages/${parsed.data.designPackageId}/rooms/${parsed.data.roomTemplateId}`);
  redirect(`/design-packages/${parsed.data.designPackageId}/rooms/${parsed.data.roomTemplateId}/edit`);
}

export async function updateRoomBoqTemplateItemAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE });

  const parsed = boqItemSchema.safeParse({
    designPackageId: formData.get("designPackageId"),
    roomTemplateId: formData.get("roomTemplateId"),
    itemId: formData.get("itemId"),
    itemMasterId: formData.get("itemMasterId"),
    sku: formData.get("sku"),
    description: formData.get("description"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    defaultQuantity: formData.get("defaultQuantity"),
    defaultUnitPrice: formData.get("defaultUnitPrice"),
    defaultCostPrice: formData.get("defaultCostPrice"),
    sortOrder: formData.get("sortOrder"),
    isOptional: formData.get("isOptional") === "on",
  });
  if (!parsed.success) throw new Error("Invalid BOQ item.");
  if (!parsed.data.itemId) throw new Error("Missing item.");

  const updated = await updateRoomBoqTemplateItem({
    itemId: parsed.data.itemId,
    itemMasterId: parsed.data.itemMasterId || null,
    sku: parsed.data.sku || null,
    description: parsed.data.description,
    category: parsed.data.category,
    unit: parsed.data.unit,
    defaultQuantity: clampNonNegative(parsed.data.defaultQuantity),
    defaultUnitPrice: clampNonNegative(parsed.data.defaultUnitPrice),
    defaultCostPrice: clampNonNegative(parsed.data.defaultCostPrice),
    sortOrder: Number.isFinite(parsed.data.sortOrder) ? parsed.data.sortOrder : 0,
    isOptional: parsed.data.isOptional,
  });

  await auditLog({
    module: "design_package",
    action: "update_room_item",
    actorUserId: userId,
    projectId: null,
    entityType: "RoomBoqTemplateItem",
    entityId: updated.id,
    metadata: { roomTemplateId: updated.roomTemplateId, category: updated.category, description: updated.description },
  });

  revalidatePath(`/design-packages/${parsed.data.designPackageId}/rooms/${parsed.data.roomTemplateId}`);
  redirect(`/design-packages/${parsed.data.designPackageId}/rooms/${parsed.data.roomTemplateId}/edit`);
}

const deleteItemSchema = z.object({
  designPackageId: z.string().min(1),
  roomTemplateId: z.string().min(1),
  itemId: z.string().min(1),
});

export async function deleteRoomBoqTemplateItemAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE });

  const parsed = deleteItemSchema.safeParse({
    designPackageId: formData.get("designPackageId"),
    roomTemplateId: formData.get("roomTemplateId"),
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const existing = await prisma.roomBoqTemplateItem.findUnique({
    where: { id: parsed.data.itemId },
    select: { id: true, roomTemplateId: true, description: true },
  });
  if (!existing || existing.roomTemplateId !== parsed.data.roomTemplateId) throw new Error("Not found.");

  await deleteRoomBoqTemplateItem(parsed.data.itemId);

  await auditLog({
    module: "design_package",
    action: "delete_room_item",
    actorUserId: userId,
    projectId: null,
    entityType: "RoomBoqTemplateItem",
    entityId: parsed.data.itemId,
    metadata: { roomTemplateId: parsed.data.roomTemplateId, description: existing.description },
  });

  revalidatePath(`/design-packages/${parsed.data.designPackageId}/rooms/${parsed.data.roomTemplateId}`);
  redirect(`/design-packages/${parsed.data.designPackageId}/rooms/${parsed.data.roomTemplateId}/edit`);
}

