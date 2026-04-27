-- Phase 1 architecture lock-in (incremental, safe defaults, minimal breaking changes).
-- Notes:
-- - DB is the source of truth; Prisma mapping changes (e.g. quoteReferenceNumber -> quotationNumber)
--   do not require DB renames unless indexes/constraints change.
-- - This migration intentionally keeps new fields nullable where backfill is needed.

-- 1) Client normalization: ClientCode + Contacts
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "clientCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Client_clientCode_key" ON "Client"("clientCode");
CREATE INDEX IF NOT EXISTS "Client_clientCode_idx" ON "Client"("clientCode");

CREATE TABLE IF NOT EXISTS "ClientContact" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "roleTitle" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClientContact_clientId_idx" ON "ClientContact"("clientId");
CREATE INDEX IF NOT EXISTS "ClientContact_email_idx" ON "ClientContact"("email");
CREATE INDEX IF NOT EXISTS "ClientContact_phone_idx" ON "ClientContact"("phone");
CREATE INDEX IF NOT EXISTS "ClientContact_isPrimary_idx" ON "ClientContact"("isPrimary");
CREATE UNIQUE INDEX IF NOT EXISTS "ClientContact_clientId_email_key" ON "ClientContact"("clientId", "email");

DO $$ BEGIN
  ALTER TABLE "ClientContact"
    ADD CONSTRAINT "ClientContact_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) SKU master tables
DO $$ BEGIN
  CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ItemCategory" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ItemCategory_code_key" ON "ItemCategory"("code");
CREATE INDEX IF NOT EXISTS "ItemCategory_name_idx" ON "ItemCategory"("name");
CREATE INDEX IF NOT EXISTS "ItemCategory_status_idx" ON "ItemCategory"("status");

CREATE TABLE IF NOT EXISTS "UnitOfMeasure" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UnitOfMeasure_code_key" ON "UnitOfMeasure"("code");
CREATE INDEX IF NOT EXISTS "UnitOfMeasure_name_idx" ON "UnitOfMeasure"("name");

CREATE TABLE IF NOT EXISTS "ItemMaster" (
  "id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "categoryId" TEXT,
  "unitId" TEXT,
  "sellPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "costPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxCode" TEXT,
  "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemMaster_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ItemMaster_sku_key" ON "ItemMaster"("sku");
CREATE INDEX IF NOT EXISTS "ItemMaster_name_idx" ON "ItemMaster"("name");
CREATE INDEX IF NOT EXISTS "ItemMaster_status_idx" ON "ItemMaster"("status");
CREATE INDEX IF NOT EXISTS "ItemMaster_categoryId_idx" ON "ItemMaster"("categoryId");
CREATE INDEX IF NOT EXISTS "ItemMaster_unitId_idx" ON "ItemMaster"("unitId");

DO $$ BEGIN
  ALTER TABLE "ItemMaster"
    ADD CONSTRAINT "ItemMaster_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ItemMaster"
    ADD CONSTRAINT "ItemMaster_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Quotation architecture adjustments
-- 3a) Unique constraint: quotationNumber + version (drop old unique on quoteReferenceNumber if present)
DROP INDEX IF EXISTS "Quotation_quoteReferenceNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_quoteReferenceNumber_version_key"
  ON "Quotation"("quoteReferenceNumber", "version");
CREATE INDEX IF NOT EXISTS "Quotation_projectId_version_idx" ON "Quotation"("projectId", "version");

-- 3b) Payment term breakdown (structured progressive terms)
CREATE TABLE IF NOT EXISTS "QuotationPaymentTerm" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "percent" DECIMAL(7,4),
  "amount" DECIMAL(14,2),
  "dueDate" TIMESTAMP(3),
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuotationPaymentTerm_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuotationPaymentTerm_quotationId_idx" ON "QuotationPaymentTerm"("quotationId");
CREATE INDEX IF NOT EXISTS "QuotationPaymentTerm_dueDate_idx" ON "QuotationPaymentTerm"("dueDate");
CREATE INDEX IF NOT EXISTS "QuotationPaymentTerm_sortOrder_idx" ON "QuotationPaymentTerm"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "QuotationPaymentTerm"
    ADD CONSTRAINT "QuotationPaymentTerm_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3c) Link quotation items to ItemMaster and UOM (nullable for incremental backfill)
ALTER TABLE "QuotationLineItem"
  ADD COLUMN IF NOT EXISTS "itemMasterId" TEXT,
  ADD COLUMN IF NOT EXISTS "unitOfMeasureId" TEXT;

CREATE INDEX IF NOT EXISTS "QuotationLineItem_itemMasterId_idx" ON "QuotationLineItem"("itemMasterId");
CREATE INDEX IF NOT EXISTS "QuotationLineItem_unitOfMeasureId_idx" ON "QuotationLineItem"("unitOfMeasureId");

DO $$ BEGIN
  ALTER TABLE "QuotationLineItem"
    ADD CONSTRAINT "QuotationLineItem_itemMasterId_fkey"
    FOREIGN KEY ("itemMasterId") REFERENCES "ItemMaster"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "QuotationLineItem"
    ADD CONSTRAINT "QuotationLineItem_unitOfMeasureId_fkey"
    FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

