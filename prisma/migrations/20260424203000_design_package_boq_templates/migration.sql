-- Design package + room BOQ template engine (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "RoomType" AS ENUM (
    'LIVING_ROOM',
    'DINING_ROOM',
    'KITCHEN',
    'MASTER_BEDROOM',
    'BEDROOM',
    'BATHROOM',
    'COMMON_TOILET',
    'STUDY_ROOM',
    'SERVICE_YARD',
    'BALCONY',
    'FOYER',
    'WHOLE_UNIT',
    'COMMERCIAL_AREA',
    'OFFICE_AREA',
    'RETAIL_AREA',
    'FNB_AREA',
    'OTHERS'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DesignPackage" (
  "id" TEXT NOT NULL,
  "packageCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "propertyType" "PropertyType" NOT NULL,
  "designStyle" "DesignStyle",
  "estimatedBudgetMin" DECIMAL(14,2),
  "estimatedBudgetMax" DECIMAL(14,2),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignPackage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DesignPackage_packageCode_key" ON "DesignPackage"("packageCode");
CREATE INDEX IF NOT EXISTS "DesignPackage_propertyType_idx" ON "DesignPackage"("propertyType");
CREATE INDEX IF NOT EXISTS "DesignPackage_designStyle_idx" ON "DesignPackage"("designStyle");
CREATE INDEX IF NOT EXISTS "DesignPackage_isActive_idx" ON "DesignPackage"("isActive");
CREATE INDEX IF NOT EXISTS "DesignPackage_createdAt_idx" ON "DesignPackage"("createdAt");

CREATE TABLE IF NOT EXISTS "RoomTemplate" (
  "id" TEXT NOT NULL,
  "designPackageId" TEXT,
  "roomCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "roomType" "RoomType" NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoomTemplate_designPackageId_roomCode_key"
  ON "RoomTemplate"("designPackageId","roomCode");
CREATE INDEX IF NOT EXISTS "RoomTemplate_designPackageId_idx" ON "RoomTemplate"("designPackageId");
CREATE INDEX IF NOT EXISTS "RoomTemplate_roomType_idx" ON "RoomTemplate"("roomType");
CREATE INDEX IF NOT EXISTS "RoomTemplate_isActive_idx" ON "RoomTemplate"("isActive");
CREATE INDEX IF NOT EXISTS "RoomTemplate_sortOrder_idx" ON "RoomTemplate"("sortOrder");
CREATE INDEX IF NOT EXISTS "RoomTemplate_createdAt_idx" ON "RoomTemplate"("createdAt");

DO $$ BEGIN
  ALTER TABLE "RoomTemplate"
    ADD CONSTRAINT "RoomTemplate_designPackageId_fkey"
    FOREIGN KEY ("designPackageId") REFERENCES "DesignPackage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "RoomBoqTemplateItem" (
  "id" TEXT NOT NULL,
  "roomTemplateId" TEXT NOT NULL,
  "itemMasterId" TEXT,
  "sku" TEXT,
  "description" TEXT NOT NULL,
  "category" "ScopeCategory" NOT NULL,
  "unit" TEXT NOT NULL,
  "defaultQuantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "defaultUnitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "defaultCostPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isOptional" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomBoqTemplateItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RoomBoqTemplateItem_roomTemplateId_idx" ON "RoomBoqTemplateItem"("roomTemplateId");
CREATE INDEX IF NOT EXISTS "RoomBoqTemplateItem_itemMasterId_idx" ON "RoomBoqTemplateItem"("itemMasterId");
CREATE INDEX IF NOT EXISTS "RoomBoqTemplateItem_category_idx" ON "RoomBoqTemplateItem"("category");
CREATE INDEX IF NOT EXISTS "RoomBoqTemplateItem_sortOrder_idx" ON "RoomBoqTemplateItem"("sortOrder");
CREATE INDEX IF NOT EXISTS "RoomBoqTemplateItem_createdAt_idx" ON "RoomBoqTemplateItem"("createdAt");

DO $$ BEGIN
  ALTER TABLE "RoomBoqTemplateItem"
    ADD CONSTRAINT "RoomBoqTemplateItem_roomTemplateId_fkey"
    FOREIGN KEY ("roomTemplateId") REFERENCES "RoomTemplate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RoomBoqTemplateItem"
    ADD CONSTRAINT "RoomBoqTemplateItem_itemMasterId_fkey"
    FOREIGN KEY ("itemMasterId") REFERENCES "ItemMaster"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

