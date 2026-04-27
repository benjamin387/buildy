-- Variation Order + Change Control Engine (incremental enhancement).
-- - Extends VariationOrder with approval workflow metadata and contract/quotation linkage
-- - Extends VariationOrderLineItem for SKU/ItemMaster linkage and margin fields
-- - Adds VariationApproval
-- - Adds VARIATION_ORDER to messaging/public link enums

-- 1) Enum updates

-- VariationOrderStatus: SUBMITTED -> PENDING_APPROVAL (rename if needed), add INVOICED if missing
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'VariationOrderStatus' AND e.enumlabel = 'SUBMITTED'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'VariationOrderStatus' AND e.enumlabel = 'PENDING_APPROVAL'
  ) THEN
    ALTER TYPE "VariationOrderStatus" RENAME VALUE 'SUBMITTED' TO 'PENDING_APPROVAL';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'VariationOrderStatus' AND e.enumlabel = 'PENDING_APPROVAL'
  ) THEN
    ALTER TYPE "VariationOrderStatus" ADD VALUE 'PENDING_APPROVAL';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'VariationOrderStatus' AND e.enumlabel = 'INVOICED'
  ) THEN
    ALTER TYPE "VariationOrderStatus" ADD VALUE 'INVOICED';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- VariationApprovalStatus
DO $$ BEGIN
  CREATE TYPE "VariationApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Messaging/public link enum extensions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'MessageRelatedType' AND e.enumlabel = 'VARIATION_ORDER'
  ) THEN
    ALTER TYPE "MessageRelatedType" ADD VALUE 'VARIATION_ORDER';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PublicDocumentType' AND e.enumlabel = 'VARIATION_ORDER'
  ) THEN
    ALTER TYPE "PublicDocumentType" ADD VALUE 'VARIATION_ORDER';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 2) VariationOrder table enhancements
ALTER TABLE "VariationOrder"
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "requestedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "contractId" TEXT,
  ADD COLUMN IF NOT EXISTS "quotationId" TEXT,
  ADD COLUMN IF NOT EXISTS "timeImpactDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "costImpact" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "VariationOrder"
    ADD CONSTRAINT "VariationOrder_contractId_fkey"
    -- Contract Prisma model is mapped to "JobContract" table in this repo.
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VariationOrder"
    ADD CONSTRAINT "VariationOrder_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "VariationOrder_contractId_idx" ON "VariationOrder"("contractId");
CREATE INDEX IF NOT EXISTS "VariationOrder_quotationId_idx" ON "VariationOrder"("quotationId");
CREATE INDEX IF NOT EXISTS "VariationOrder_submittedAt_idx" ON "VariationOrder"("submittedAt");
CREATE INDEX IF NOT EXISTS "VariationOrder_approvedAt_idx" ON "VariationOrder"("approvedAt");

-- 3) VariationOrderLineItem enhancements
ALTER TABLE "VariationOrderLineItem"
  ADD COLUMN IF NOT EXISTS "itemId" TEXT,
  ADD COLUMN IF NOT EXISTS "sku" TEXT,
  ADD COLUMN IF NOT EXISTS "profitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "marginPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE "VariationOrderLineItem"
    ADD CONSTRAINT "VariationOrderLineItem_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "ItemMaster"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "VariationOrderLineItem_itemId_idx" ON "VariationOrderLineItem"("itemId");
CREATE INDEX IF NOT EXISTS "VariationOrderLineItem_sku_idx" ON "VariationOrderLineItem"("sku");

-- 4) VariationApproval table
CREATE TABLE IF NOT EXISTS "VariationApproval" (
  "id" TEXT NOT NULL,
  "variationOrderId" TEXT NOT NULL,
  "approverName" TEXT NOT NULL,
  "approverEmail" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" "VariationApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VariationApproval_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "VariationApproval"
    ADD CONSTRAINT "VariationApproval_variationOrderId_fkey"
    FOREIGN KEY ("variationOrderId") REFERENCES "VariationOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "VariationApproval_variationOrderId_idx" ON "VariationApproval"("variationOrderId");
CREATE INDEX IF NOT EXISTS "VariationApproval_approverEmail_idx" ON "VariationApproval"("approverEmail");
CREATE INDEX IF NOT EXISTS "VariationApproval_status_idx" ON "VariationApproval"("status");
CREATE INDEX IF NOT EXISTS "VariationApproval_approvedAt_idx" ON "VariationApproval"("approvedAt");
