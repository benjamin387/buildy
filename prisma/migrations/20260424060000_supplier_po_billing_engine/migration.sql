-- Supplier + Subcontract + PO + Supplier Bill engine (incremental, safe).
-- This migration extends existing Vendor/Subcontract tables and adds new procurement & supplier billing tables.

-- 1) Expand existing enums.
DO $$ BEGIN
  ALTER TYPE "VendorType" ADD VALUE 'BOTH';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "VendorOnboardingStatus" ADD VALUE 'INACTIVE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ComplianceDocType" ADD VALUE 'BIZSAFE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) New enums.
DO $$ BEGIN
  CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierDocumentType" AS ENUM ('INSURANCE', 'LICENSE', 'BIZSAFE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierDocumentStatus" AS ENUM ('PENDING', 'VALID', 'EXPIRED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierBillStatus" AS ENUM ('DRAFT', 'RECEIVED', 'APPROVED', 'PAID', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubcontractClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CERTIFIED', 'REJECTED', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Vendor (Supplier) master extensions.
ALTER TABLE "Vendor"
  ADD COLUMN IF NOT EXISTS "supplierCode" TEXT,
  ADD COLUMN IF NOT EXISTS "uen" TEXT,
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNo" TEXT,
  ADD COLUMN IF NOT EXISTS "paynowUen" TEXT,
  ADD COLUMN IF NOT EXISTS "gstRegistered" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_supplierCode_key" ON "Vendor"("supplierCode");
CREATE INDEX IF NOT EXISTS "Vendor_supplierCode_idx" ON "Vendor"("supplierCode");

-- 4) Subcontract table extensions (existing table "Subcontract").
ALTER TABLE "Subcontract"
  ADD COLUMN IF NOT EXISTS "subcontractNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "scopeSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "commencementDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completionDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "warrantyMonths" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retentionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "defectsLiabilityDays" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "Subcontract_subcontractNumber_key" ON "Subcontract"("subcontractNumber");
CREATE INDEX IF NOT EXISTS "Subcontract_commencementDate_idx" ON "Subcontract"("commencementDate");
CREATE INDEX IF NOT EXISTS "Subcontract_completionDate_idx" ON "Subcontract"("completionDate");

-- 5) Supplier contacts & documents.
CREATE TABLE IF NOT EXISTS "SupplierContact" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "designation" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");
CREATE INDEX IF NOT EXISTS "SupplierContact_email_idx" ON "SupplierContact"("email");
CREATE INDEX IF NOT EXISTS "SupplierContact_phone_idx" ON "SupplierContact"("phone");
CREATE INDEX IF NOT EXISTS "SupplierContact_isPrimary_idx" ON "SupplierContact"("isPrimary");

DO $$ BEGIN
  ALTER TABLE "SupplierContact"
    ADD CONSTRAINT "SupplierContact_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SupplierDocument" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "documentType" "SupplierDocumentType" NOT NULL,
  "documentName" TEXT NOT NULL,
  "expiryDate" TIMESTAMP(3),
  "fileUrl" TEXT,
  "status" "SupplierDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupplierDocument_supplierId_idx" ON "SupplierDocument"("supplierId");
CREATE INDEX IF NOT EXISTS "SupplierDocument_documentType_idx" ON "SupplierDocument"("documentType");
CREATE INDEX IF NOT EXISTS "SupplierDocument_expiryDate_idx" ON "SupplierDocument"("expiryDate");
CREATE INDEX IF NOT EXISTS "SupplierDocument_status_idx" ON "SupplierDocument"("status");

DO $$ BEGIN
  ALTER TABLE "SupplierDocument"
    ADD CONSTRAINT "SupplierDocument_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6) Purchase Orders.
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "poNumber" TEXT NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "issueDate" TIMESTAMP(3) NOT NULL,
  "expectedDeliveryDate" TIMESTAMP(3),
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_projectId_idx" ON "PurchaseOrder"("projectId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_issueDate_idx" ON "PurchaseOrder"("issueDate");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_expectedDeliveryDate_idx" ON "PurchaseOrder"("expectedDeliveryDate");

DO $$ BEGIN
  ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PurchaseOrderLine" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "itemId" TEXT,
  "sku" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "lineAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_itemId_idx" ON "PurchaseOrderLine"("itemId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_sortOrder_idx" ON "PurchaseOrderLine"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "PurchaseOrderLine"
    ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PurchaseOrderLine"
    ADD CONSTRAINT "PurchaseOrderLine_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "ItemMaster"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7) Subcontract claims.
CREATE TABLE IF NOT EXISTS "SubcontractClaim" (
  "id" TEXT NOT NULL,
  "subcontractId" TEXT NOT NULL,
  "claimNumber" TEXT NOT NULL,
  "claimDate" TIMESTAMP(3) NOT NULL,
  "claimedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "certifiedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "SubcontractClaimStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubcontractClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SubcontractClaim_subcontractId_claimNumber_key"
  ON "SubcontractClaim"("subcontractId", "claimNumber");
CREATE INDEX IF NOT EXISTS "SubcontractClaim_subcontractId_idx" ON "SubcontractClaim"("subcontractId");
CREATE INDEX IF NOT EXISTS "SubcontractClaim_claimDate_idx" ON "SubcontractClaim"("claimDate");
CREATE INDEX IF NOT EXISTS "SubcontractClaim_status_idx" ON "SubcontractClaim"("status");

DO $$ BEGIN
  ALTER TABLE "SubcontractClaim"
    ADD CONSTRAINT "SubcontractClaim_subcontractId_fkey"
    FOREIGN KEY ("subcontractId") REFERENCES "Subcontract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8) Supplier bills.
CREATE TABLE IF NOT EXISTS "SupplierBill" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "purchaseOrderId" TEXT,
  "subcontractId" TEXT,
  "billNumber" TEXT NOT NULL,
  "billDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "outstandingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "SupplierBillStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierBill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierBill_billNumber_key" ON "SupplierBill"("billNumber");
CREATE INDEX IF NOT EXISTS "SupplierBill_projectId_idx" ON "SupplierBill"("projectId");
CREATE INDEX IF NOT EXISTS "SupplierBill_supplierId_idx" ON "SupplierBill"("supplierId");
CREATE INDEX IF NOT EXISTS "SupplierBill_purchaseOrderId_idx" ON "SupplierBill"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "SupplierBill_subcontractId_idx" ON "SupplierBill"("subcontractId");
CREATE INDEX IF NOT EXISTS "SupplierBill_status_idx" ON "SupplierBill"("status");
CREATE INDEX IF NOT EXISTS "SupplierBill_billDate_idx" ON "SupplierBill"("billDate");
CREATE INDEX IF NOT EXISTS "SupplierBill_dueDate_idx" ON "SupplierBill"("dueDate");

DO $$ BEGIN
  ALTER TABLE "SupplierBill"
    ADD CONSTRAINT "SupplierBill_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupplierBill"
    ADD CONSTRAINT "SupplierBill_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupplierBill"
    ADD CONSTRAINT "SupplierBill_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupplierBill"
    ADD CONSTRAINT "SupplierBill_subcontractId_fkey"
    FOREIGN KEY ("subcontractId") REFERENCES "Subcontract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SupplierBillLine" (
  "id" TEXT NOT NULL,
  "supplierBillId" TEXT NOT NULL,
  "itemId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "lineAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierBillLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupplierBillLine_supplierBillId_idx" ON "SupplierBillLine"("supplierBillId");
CREATE INDEX IF NOT EXISTS "SupplierBillLine_itemId_idx" ON "SupplierBillLine"("itemId");
CREATE INDEX IF NOT EXISTS "SupplierBillLine_sortOrder_idx" ON "SupplierBillLine"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "SupplierBillLine"
    ADD CONSTRAINT "SupplierBillLine_supplierBillId_fkey"
    FOREIGN KEY ("supplierBillId") REFERENCES "SupplierBill"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupplierBillLine"
    ADD CONSTRAINT "SupplierBillLine_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "ItemMaster"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

