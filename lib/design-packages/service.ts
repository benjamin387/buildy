import { prisma } from "@/lib/prisma";
import { Prisma, type DesignStyle, type PropertyType, type RoomType, type ScopeCategory } from "@prisma/client";

function asDecimal(value: number | Prisma.Decimal | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value;
  if (!Number.isFinite(value)) return null;
  return new Prisma.Decimal(Math.round((value + Number.EPSILON) * 100) / 100);
}

export async function listDesignPackages(input?: {
  search?: string;
  propertyType?: PropertyType | "ALL";
  designStyle?: DesignStyle | "ALL";
  isActive?: boolean | "ALL";
}) {
  const q = input?.search?.trim();
  const where: Prisma.DesignPackageWhereInput = {
    ...(q
      ? {
          OR: [
            { packageCode: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(input?.propertyType && input.propertyType !== "ALL" ? { propertyType: input.propertyType } : {}),
    ...(input?.designStyle && input.designStyle !== "ALL" ? { designStyle: input.designStyle } : {}),
    ...(input?.isActive === true ? { isActive: true } : {}),
    ...(input?.isActive === false ? { isActive: false } : {}),
  };

  return prisma.designPackage.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      rooms: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, roomCode: true, name: true, roomType: true, sortOrder: true, isActive: true },
      },
    },
    take: 500,
  });
}

export async function getDesignPackageById(packageId: string) {
  return prisma.designPackage.findUnique({
    where: { id: packageId },
    include: {
      rooms: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          boqItems: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: { itemMaster: { select: { id: true, sku: true, name: true } } },
          },
        },
      },
    },
  });
}

export async function getRoomTemplateById(roomTemplateId: string) {
  return prisma.roomTemplate.findUnique({
    where: { id: roomTemplateId },
    include: {
      designPackage: true,
      boqItems: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { itemMaster: { select: { id: true, sku: true, name: true, unit: { select: { code: true } } } } },
      },
    },
  });
}

export async function createDesignPackage(input: {
  packageCode: string;
  name: string;
  description?: string | null;
  propertyType: PropertyType;
  designStyle?: DesignStyle | null;
  estimatedBudgetMin?: number | null;
  estimatedBudgetMax?: number | null;
  isActive?: boolean;
}) {
  return prisma.designPackage.create({
    data: {
      packageCode: input.packageCode.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      propertyType: input.propertyType,
      designStyle: input.designStyle ?? null,
      estimatedBudgetMin: asDecimal(input.estimatedBudgetMin ?? null),
      estimatedBudgetMax: asDecimal(input.estimatedBudgetMax ?? null),
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateDesignPackage(input: {
  packageId: string;
  packageCode: string;
  name: string;
  description?: string | null;
  propertyType: PropertyType;
  designStyle?: DesignStyle | null;
  estimatedBudgetMin?: number | null;
  estimatedBudgetMax?: number | null;
  isActive?: boolean;
}) {
  return prisma.designPackage.update({
    where: { id: input.packageId },
    data: {
      packageCode: input.packageCode.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      propertyType: input.propertyType,
      designStyle: input.designStyle ?? null,
      estimatedBudgetMin: asDecimal(input.estimatedBudgetMin ?? null),
      estimatedBudgetMax: asDecimal(input.estimatedBudgetMax ?? null),
      isActive: input.isActive ?? true,
    },
  });
}

export async function createRoomTemplate(input: {
  designPackageId: string;
  roomCode: string;
  name: string;
  roomType: RoomType;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}) {
  return prisma.roomTemplate.create({
    data: {
      designPackageId: input.designPackageId,
      roomCode: input.roomCode.trim(),
      name: input.name.trim(),
      roomType: input.roomType,
      description: input.description?.trim() || null,
      sortOrder: Number.isFinite(input.sortOrder ?? 0) ? (input.sortOrder ?? 0) : 0,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateRoomTemplate(input: {
  roomTemplateId: string;
  roomCode: string;
  name: string;
  roomType: RoomType;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}) {
  return prisma.roomTemplate.update({
    where: { id: input.roomTemplateId },
    data: {
      roomCode: input.roomCode.trim(),
      name: input.name.trim(),
      roomType: input.roomType,
      description: input.description?.trim() || null,
      sortOrder: Number.isFinite(input.sortOrder ?? 0) ? (input.sortOrder ?? 0) : 0,
      isActive: input.isActive ?? true,
    },
  });
}

export async function addRoomBoqTemplateItem(input: {
  roomTemplateId: string;
  itemMasterId?: string | null;
  sku?: string | null;
  description: string;
  category: ScopeCategory;
  unit: string;
  defaultQuantity: number;
  defaultUnitPrice: number;
  defaultCostPrice: number;
  sortOrder?: number;
  isOptional?: boolean;
}) {
  const count = await prisma.roomBoqTemplateItem.count({ where: { roomTemplateId: input.roomTemplateId } });
  const sortOrder = Number.isFinite(input.sortOrder ?? NaN) ? (input.sortOrder ?? 0) : count;

  return prisma.roomBoqTemplateItem.create({
    data: {
      roomTemplateId: input.roomTemplateId,
      itemMasterId: input.itemMasterId ?? null,
      sku: input.sku?.trim() || null,
      description: input.description.trim(),
      category: input.category,
      unit: input.unit.trim() || "lot",
      defaultQuantity: asDecimal(input.defaultQuantity) ?? new Prisma.Decimal(0),
      defaultUnitPrice: asDecimal(input.defaultUnitPrice) ?? new Prisma.Decimal(0),
      defaultCostPrice: asDecimal(input.defaultCostPrice) ?? new Prisma.Decimal(0),
      sortOrder,
      isOptional: input.isOptional ?? false,
    },
  });
}

export async function updateRoomBoqTemplateItem(input: {
  itemId: string;
  itemMasterId?: string | null;
  sku?: string | null;
  description: string;
  category: ScopeCategory;
  unit: string;
  defaultQuantity: number;
  defaultUnitPrice: number;
  defaultCostPrice: number;
  sortOrder: number;
  isOptional: boolean;
}) {
  return prisma.roomBoqTemplateItem.update({
    where: { id: input.itemId },
    data: {
      itemMasterId: input.itemMasterId ?? null,
      sku: input.sku?.trim() || null,
      description: input.description.trim(),
      category: input.category,
      unit: input.unit.trim() || "lot",
      defaultQuantity: asDecimal(input.defaultQuantity) ?? new Prisma.Decimal(0),
      defaultUnitPrice: asDecimal(input.defaultUnitPrice) ?? new Prisma.Decimal(0),
      defaultCostPrice: asDecimal(input.defaultCostPrice) ?? new Prisma.Decimal(0),
      sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
      isOptional: input.isOptional,
    },
  });
}

export async function deleteRoomBoqTemplateItem(itemId: string) {
  return prisma.roomBoqTemplateItem.delete({ where: { id: itemId } });
}

export type DesignPackageWithRoomsForBuilder = Awaited<ReturnType<typeof listDesignPackagesForQuotationBuilder>>[number];

export async function listDesignPackagesForQuotationBuilder(input?: {
  propertyType?: PropertyType | null;
  designStyle?: DesignStyle | null;
}) {
  const where: Prisma.DesignPackageWhereInput = {
    isActive: true,
    ...(input?.propertyType ? { propertyType: input.propertyType } : {}),
    ...(input?.designStyle ? { designStyle: input.designStyle } : {}),
  };

  return prisma.designPackage.findMany({
    where,
    orderBy: [{ propertyType: "asc" }, { name: "asc" }],
    include: {
      rooms: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          boqItems: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: { itemMaster: { select: { id: true, sku: true, unitId: true, unit: { select: { code: true } } } } },
          },
        },
      },
    },
    take: 200,
  });
}

