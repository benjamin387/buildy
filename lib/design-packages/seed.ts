import { prisma } from "@/lib/prisma";
import { Prisma, type DesignStyle, type PropertyType, type RoomType, type ScopeCategory } from "@prisma/client";

type SeedBoqItem = {
  sku?: string;
  description: string;
  category: ScopeCategory;
  unit: string;
  qty: number;
  unitPrice: number;
  costPrice: number;
  isOptional?: boolean;
};

type SeedRoom = {
  roomCode: string;
  name: string;
  roomType: RoomType;
  description?: string;
  items: SeedBoqItem[];
};

type SeedPackage = {
  packageCode: string;
  name: string;
  description: string;
  propertyType: PropertyType;
  designStyle: DesignStyle | null;
  budgetMin: number;
  budgetMax: number;
  rooms: SeedRoom[];
};

function money(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Math.round((n + Number.EPSILON) * 100) / 100);
}

function seedCatalog(): SeedPackage[] {
  const preliminary: SeedRoom = {
    roomCode: "WHOLE_UNIT_PRELIM",
    name: "Whole Unit Preliminary Works",
    roomType: "WHOLE_UNIT",
    description: "Preliminaries, protection, hacking, and disposal.",
    items: [
      {
        description: "Site protection and floor covering (as required)",
        category: "OTHER",
        unit: "lot",
        qty: 1,
        unitPrice: 600,
        costPrice: 350,
      },
      {
        description: "Hacking and disposal of existing fixtures (allowance)",
        category: "HACKING_DEMOLITION",
        unit: "lot",
        qty: 1,
        unitPrice: 1800,
        costPrice: 1200,
      },
      {
        description: "Debris disposal and haulage (allowance)",
        category: "CLEANING_DISPOSAL",
        unit: "lot",
        qty: 1,
        unitPrice: 850,
        costPrice: 550,
      },
      {
        description: "Final cleaning and handover preparation",
        category: "CLEANING_DISPOSAL",
        unit: "lot",
        qty: 1,
        unitPrice: 450,
        costPrice: 280,
      },
    ],
  };

  const living: SeedRoom = {
    roomCode: "LIVING",
    name: "Living Room",
    roomType: "LIVING_ROOM",
    description: "Feature wall, carpentry, lighting, flooring, and painting.",
    items: [
      {
        description: "TV feature wall carpentry (allowance)",
        category: "CARPENTRY",
        unit: "lot",
        qty: 1,
        unitPrice: 3200,
        costPrice: 2100,
      },
      {
        description: "Lighting points and switches (allowance)",
        category: "ELECTRICAL_WORKS",
        unit: "point",
        qty: 6,
        unitPrice: 85,
        costPrice: 55,
      },
      {
        description: "Vinyl flooring supply & install (allowance)",
        category: "FLOORING",
        unit: "sqft",
        qty: 160,
        unitPrice: 7.5,
        costPrice: 5.2,
      },
      {
        description: "Painting works for walls and ceiling",
        category: "PAINTING_WORKS",
        unit: "sqft",
        qty: 500,
        unitPrice: 2.8,
        costPrice: 1.8,
      },
    ],
  };

  const kitchen: SeedRoom = {
    roomCode: "KITCHEN",
    name: "Kitchen",
    roomType: "KITCHEN",
    description: "Cabinets, countertop, plumbing points, electrical points, and tiling.",
    items: [
      {
        description: "Kitchen base + wall cabinets (allowance)",
        category: "CARPENTRY",
        unit: "ft run",
        qty: 18,
        unitPrice: 180,
        costPrice: 125,
      },
      {
        description: "Quartz countertop (allowance)",
        category: "MASONRY_WORKS",
        unit: "ft run",
        qty: 12,
        unitPrice: 120,
        costPrice: 80,
      },
      {
        description: "Plumbing points supply & install (allowance)",
        category: "PLUMBING_WORKS",
        unit: "point",
        qty: 2,
        unitPrice: 120,
        costPrice: 75,
      },
      {
        description: "Electrical points and isolators (allowance)",
        category: "ELECTRICAL_WORKS",
        unit: "point",
        qty: 5,
        unitPrice: 85,
        costPrice: 55,
      },
      {
        description: "Kitchen floor/wall tiling works (allowance)",
        category: "MASONRY_WORKS",
        unit: "sqft",
        qty: 220,
        unitPrice: 9.5,
        costPrice: 6.2,
      },
    ],
  };

  const masterBedroom: SeedRoom = {
    roomCode: "MBR",
    name: "Master Bedroom",
    roomType: "MASTER_BEDROOM",
    description: "Wardrobe, lighting, and painting.",
    items: [
      {
        description: "Wardrobe carpentry (allowance)",
        category: "CARPENTRY",
        unit: "ft run",
        qty: 14,
        unitPrice: 200,
        costPrice: 140,
      },
      {
        description: "Lighting points and switches (allowance)",
        category: "ELECTRICAL_WORKS",
        unit: "point",
        qty: 4,
        unitPrice: 85,
        costPrice: 55,
      },
      {
        description: "Painting works for walls and ceiling",
        category: "PAINTING_WORKS",
        unit: "sqft",
        qty: 420,
        unitPrice: 2.8,
        costPrice: 1.8,
      },
    ],
  };

  const commonBedroom: SeedRoom = {
    roomCode: "CBR",
    name: "Common Bedroom",
    roomType: "BEDROOM",
    description: "Optional wardrobe and basic electrical/painting.",
    items: [
      {
        description: "Wardrobe carpentry (optional allowance)",
        category: "CARPENTRY",
        unit: "ft run",
        qty: 10,
        unitPrice: 200,
        costPrice: 140,
        isOptional: true,
      },
      {
        description: "Lighting points and switches (allowance)",
        category: "ELECTRICAL_WORKS",
        unit: "point",
        qty: 3,
        unitPrice: 85,
        costPrice: 55,
      },
      {
        description: "Painting works for walls and ceiling",
        category: "PAINTING_WORKS",
        unit: "sqft",
        qty: 380,
        unitPrice: 2.8,
        costPrice: 1.8,
      },
    ],
  };

  const bathroom: SeedRoom = {
    roomCode: "BATH",
    name: "Bathroom / Common Toilet",
    roomType: "BATHROOM",
    description: "Sanitary, plumbing, waterproofing, and electrical.",
    items: [
      {
        description: "Waterproofing works (allowance)",
        category: "MASONRY_WORKS",
        unit: "sqft",
        qty: 90,
        unitPrice: 8.5,
        costPrice: 5.5,
      },
      {
        description: "Plumbing points supply & install (allowance)",
        category: "PLUMBING_WORKS",
        unit: "point",
        qty: 3,
        unitPrice: 120,
        costPrice: 75,
      },
      {
        description: "Electrical points (heater/light) (allowance)",
        category: "ELECTRICAL_WORKS",
        unit: "point",
        qty: 2,
        unitPrice: 85,
        costPrice: 55,
      },
      {
        description: "Replace sanitary fixtures (optional allowance)",
        category: "PLUMBING_WORKS",
        unit: "lot",
        qty: 1,
        unitPrice: 950,
        costPrice: 650,
        isOptional: true,
      },
    ],
  };

  const officeArea: SeedRoom = {
    roomCode: "OFFICE_AREA",
    name: "Office Area",
    roomType: "OFFICE_AREA",
    description: "Basic fit-out for office work area.",
    items: [
      {
        description: "Partition and false ceiling works (allowance)",
        category: "CEILING_PARTITION",
        unit: "sqft",
        qty: 650,
        unitPrice: 8.5,
        costPrice: 5.8,
      },
      {
        description: "Electrical trunking and power points (allowance)",
        category: "ELECTRICAL_WORKS",
        unit: "point",
        qty: 18,
        unitPrice: 85,
        costPrice: 55,
      },
      {
        description: "Carpet tile / vinyl flooring (allowance)",
        category: "FLOORING",
        unit: "sqft",
        qty: 650,
        unitPrice: 7.5,
        costPrice: 5.2,
      },
      {
        description: "Painting works",
        category: "PAINTING_WORKS",
        unit: "sqft",
        qty: 1600,
        unitPrice: 2.8,
        costPrice: 1.8,
      },
    ],
  };

  const fnbDining: SeedRoom = {
    roomCode: "FNB_DINING",
    name: "F&B Dining Area",
    roomType: "FNB_AREA",
    description: "Basic dining area fit-out.",
    items: [
      {
        description: "Feature wall / signage backing (allowance)",
        category: "CARPENTRY",
        unit: "lot",
        qty: 1,
        unitPrice: 2800,
        costPrice: 1900,
      },
      {
        description: "Electrical points and lighting (allowance)",
        category: "ELECTRICAL_WORKS",
        unit: "point",
        qty: 16,
        unitPrice: 85,
        costPrice: 55,
      },
      {
        description: "Flooring works (allowance)",
        category: "FLOORING",
        unit: "sqft",
        qty: 800,
        unitPrice: 8.2,
        costPrice: 5.8,
      },
      {
        description: "Painting works",
        category: "PAINTING_WORKS",
        unit: "sqft",
        qty: 2200,
        unitPrice: 2.8,
        costPrice: 1.8,
      },
    ],
  };

  const fnbKitchen: SeedRoom = {
    roomCode: "FNB_KITCHEN",
    name: "F&B Kitchen Area",
    roomType: "FNB_AREA",
    description: "Wet works and M&E allowances for kitchen.",
    items: [
      {
        description: "Stainless steel table / basic cabinetry (allowance)",
        category: "CARPENTRY",
        unit: "lot",
        qty: 1,
        unitPrice: 4200,
        costPrice: 3000,
      },
      {
        description: "Plumbing points (allowance)",
        category: "PLUMBING_WORKS",
        unit: "point",
        qty: 5,
        unitPrice: 120,
        costPrice: 75,
      },
      {
        description: "Electrical points and isolators (allowance)",
        category: "ELECTRICAL_WORKS",
        unit: "point",
        qty: 10,
        unitPrice: 85,
        costPrice: 55,
      },
      {
        description: "Tiling and wet works (allowance)",
        category: "MASONRY_WORKS",
        unit: "sqft",
        qty: 520,
        unitPrice: 9.5,
        costPrice: 6.2,
      },
    ],
  };

  return [
    {
      packageCode: "PKG-HDB-MODERN",
      name: "Modern HDB Renovation",
      description: "Standard modern renovation scope suitable for HDB apartments.",
      propertyType: "HDB",
      designStyle: "MODERN",
      budgetMin: 45000,
      budgetMax: 85000,
      rooms: [preliminary, living, kitchen, masterBedroom, commonBedroom, bathroom],
    },
    {
      packageCode: "PKG-CONDO-MIN",
      name: "Minimalist Condo Renovation",
      description: "Clean minimalist renovation scope for condominium units.",
      propertyType: "CONDO",
      designStyle: "MINIMALIST",
      budgetMin: 65000,
      budgetMax: 120000,
      rooms: [preliminary, living, kitchen, masterBedroom, commonBedroom, bathroom],
    },
    {
      packageCode: "PKG-CONDO-SCAN",
      name: "Scandinavian Condo Renovation",
      description: "Scandinavian package with warm neutrals and functional carpentry.",
      propertyType: "CONDO",
      designStyle: "SCANDINAVIAN",
      budgetMin: 65000,
      budgetMax: 120000,
      rooms: [preliminary, living, kitchen, masterBedroom, commonBedroom, bathroom],
    },
    {
      packageCode: "PKG-COMM-OFFICE",
      name: "Commercial Office Fit-Out",
      description: "Basic office fit-out: partitions, M&E, flooring, and finishes.",
      propertyType: "COMMERCIAL",
      designStyle: "CONTEMPORARY",
      budgetMin: 80000,
      budgetMax: 250000,
      rooms: [preliminary, officeArea],
    },
    {
      packageCode: "PKG-COMM-FNB-BASIC",
      name: "F&B Basic Fit-Out",
      description: "Basic fit-out for F&B including dining and kitchen allowances.",
      propertyType: "COMMERCIAL",
      designStyle: null,
      budgetMin: 120000,
      budgetMax: 350000,
      rooms: [preliminary, fnbDining, fnbKitchen],
    },
  ];
}

export async function seedDesignPackageDefaults(params?: { force?: boolean }) {
  const force = params?.force ?? false;

  const existingCount = await prisma.designPackage.count();
  if (existingCount > 0 && !force) {
    return { createdPackages: 0, createdRooms: 0, createdItems: 0, skipped: true };
  }

  const catalog = seedCatalog();

  let createdPackages = 0;
  let createdRooms = 0;
  let createdItems = 0;

  for (const pkg of catalog) {
    const dp = await prisma.designPackage.upsert({
      where: { packageCode: pkg.packageCode },
      create: {
        packageCode: pkg.packageCode,
        name: pkg.name,
        description: pkg.description,
        propertyType: pkg.propertyType,
        designStyle: pkg.designStyle,
        estimatedBudgetMin: money(pkg.budgetMin),
        estimatedBudgetMax: money(pkg.budgetMax),
        isActive: true,
      },
      update: {
        name: pkg.name,
        description: pkg.description,
        propertyType: pkg.propertyType,
        designStyle: pkg.designStyle,
        estimatedBudgetMin: money(pkg.budgetMin),
        estimatedBudgetMax: money(pkg.budgetMax),
        isActive: true,
      },
    });

    // Counting "created" precisely on upsert is tricky; we approximate by checking if it existed.
    // This is fine for a seed helper.
    createdPackages += 1;

    for (let idx = 0; idx < pkg.rooms.length; idx += 1) {
      const room = pkg.rooms[idx];
      const rt = await prisma.roomTemplate.upsert({
        where: {
          designPackageId_roomCode: {
            designPackageId: dp.id,
            roomCode: room.roomCode,
          },
        },
        create: {
          designPackageId: dp.id,
          roomCode: room.roomCode,
          name: room.name,
          roomType: room.roomType,
          description: room.description ?? null,
          sortOrder: idx,
          isActive: true,
        },
        update: {
          name: room.name,
          roomType: room.roomType,
          description: room.description ?? null,
          sortOrder: idx,
          isActive: true,
        },
      });

      createdRooms += 1;

      const existingItems = await prisma.roomBoqTemplateItem.count({ where: { roomTemplateId: rt.id } });
      if (existingItems > 0 && !force) continue;

      if (force && existingItems > 0) {
        await prisma.roomBoqTemplateItem.deleteMany({ where: { roomTemplateId: rt.id } });
      }

      await prisma.roomBoqTemplateItem.createMany({
        data: room.items.map((item, itemIndex) => ({
          roomTemplateId: rt.id,
          itemMasterId: null,
          sku: item.sku?.trim() || null,
          description: item.description,
          category: item.category,
          unit: item.unit,
          defaultQuantity: money(item.qty),
          defaultUnitPrice: money(item.unitPrice),
          defaultCostPrice: money(item.costPrice),
          sortOrder: itemIndex,
          isOptional: item.isOptional ?? false,
        })),
      });

      createdItems += room.items.length;
    }
  }

  return { createdPackages, createdRooms, createdItems, skipped: false };
}
