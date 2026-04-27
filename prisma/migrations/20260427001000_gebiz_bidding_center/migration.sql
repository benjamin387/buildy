-- GeBIZ Contract Bidding Center

-- Add module key for RBAC matrix (safe for existing DBs)
DO $$ BEGIN
  ALTER TYPE "PermissionModuleKey" ADD VALUE IF NOT EXISTS 'BIDDING';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidOpportunitySource" AS ENUM ('GEBIZ', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidProcurementType" AS ENUM ('QUOTATION', 'TENDER', 'RFI', 'FRAMEWORK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidOpportunityStatus" AS ENUM (
    'WATCHING',
    'BID_NO_BID',
    'PREPARING',
    'PENDING_APPROVAL',
    'SUBMITTED',
    'AWARDED',
    'LOST',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidCostCategory" AS ENUM (
    'MATERIAL',
    'LABOUR',
    'SUBCONTRACTOR',
    'PRELIMINARIES',
    'OVERHEAD',
    'CONTINGENCY',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidDocumentStatus" AS ENUM ('REQUIRED', 'PREPARED', 'UPLOADED', 'SUBMITTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidActivityType" AS ENUM (
    'NOTE',
    'STATUS_CHANGE',
    'DOCUMENT',
    'COSTING',
    'APPROVAL',
    'SUBMISSION',
    'AWARD'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidChecklistStatus" AS ENUM ('PENDING', 'COMPLETED', 'NOT_APPLICABLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BidOpportunity" (
  "id" TEXT NOT NULL,
  "source" "BidOpportunitySource" NOT NULL DEFAULT 'GEBIZ',
  "opportunityNo" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "agency" TEXT NOT NULL,
  "procurementType" "BidProcurementType" NOT NULL DEFAULT 'QUOTATION',
  "category" TEXT,
  "status" "BidOpportunityStatus" NOT NULL DEFAULT 'WATCHING',
  "closingDate" TIMESTAMPTZ,
  "briefingDate" TIMESTAMPTZ,
  "estimatedValue" NUMERIC(14,2),
  "bidPrice" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "estimatedCost" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "targetMargin" NUMERIC(6,4),
  "finalMargin" NUMERIC(6,4),
  "remarks" TEXT,
  "awardedProjectId" TEXT,
  "awardedContractId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidOpportunity_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidOpportunity"
    ADD CONSTRAINT "BidOpportunity_opportunityNo_key" UNIQUE ("opportunityNo");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidOpportunity"
    ADD CONSTRAINT "BidOpportunity_awardedProjectId_fkey"
    FOREIGN KEY ("awardedProjectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Contract table is mapped as "JobContract" in schema, so we reference "JobContract".
DO $$ BEGIN
  ALTER TABLE "BidOpportunity"
    ADD CONSTRAINT "BidOpportunity_awardedContractId_fkey"
    FOREIGN KEY ("awardedContractId") REFERENCES "JobContract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidOpportunity_source_idx" ON "BidOpportunity"("source");
CREATE INDEX IF NOT EXISTS "BidOpportunity_status_idx" ON "BidOpportunity"("status");
CREATE INDEX IF NOT EXISTS "BidOpportunity_procurementType_idx" ON "BidOpportunity"("procurementType");
CREATE INDEX IF NOT EXISTS "BidOpportunity_closingDate_idx" ON "BidOpportunity"("closingDate");
CREATE INDEX IF NOT EXISTS "BidOpportunity_briefingDate_idx" ON "BidOpportunity"("briefingDate");
CREATE INDEX IF NOT EXISTS "BidOpportunity_createdAt_idx" ON "BidOpportunity"("createdAt");
CREATE INDEX IF NOT EXISTS "BidOpportunity_updatedAt_idx" ON "BidOpportunity"("updatedAt");

CREATE TABLE IF NOT EXISTS "BidDocument" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "documentName" TEXT NOT NULL,
  "documentType" TEXT,
  "fileUrl" TEXT,
  "status" "BidDocumentStatus" NOT NULL DEFAULT 'REQUIRED',
  "dueDate" TIMESTAMPTZ,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidDocument_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidDocument"
    ADD CONSTRAINT "BidDocument_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidDocument_opportunityId_idx" ON "BidDocument"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidDocument_status_idx" ON "BidDocument"("status");
CREATE INDEX IF NOT EXISTS "BidDocument_dueDate_idx" ON "BidDocument"("dueDate");
CREATE INDEX IF NOT EXISTS "BidDocument_createdAt_idx" ON "BidDocument"("createdAt");

CREATE TABLE IF NOT EXISTS "BidCostItem" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "category" "BidCostCategory" NOT NULL DEFAULT 'OTHER',
  "description" TEXT NOT NULL,
  "unit" TEXT,
  "quantity" NUMERIC(14,2) NOT NULL DEFAULT 1,
  "unitCost" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "unitSell" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "totalCost" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "totalSell" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidCostItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidCostItem"
    ADD CONSTRAINT "BidCostItem_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidCostItem_opportunityId_idx" ON "BidCostItem"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidCostItem_category_idx" ON "BidCostItem"("category");
CREATE INDEX IF NOT EXISTS "BidCostItem_sortOrder_idx" ON "BidCostItem"("sortOrder");
CREATE INDEX IF NOT EXISTS "BidCostItem_createdAt_idx" ON "BidCostItem"("createdAt");

CREATE TABLE IF NOT EXISTS "BidSupplierQuote" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "supplierId" TEXT,
  "supplierName" TEXT NOT NULL,
  "quoteAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "leadTimeDays" INT,
  "validityDate" TIMESTAMPTZ,
  "notes" TEXT,
  "fileUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidSupplierQuote_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidSupplierQuote"
    ADD CONSTRAINT "BidSupplierQuote_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidSupplierQuote"
    ADD CONSTRAINT "BidSupplierQuote_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidSupplierQuote_opportunityId_idx" ON "BidSupplierQuote"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidSupplierQuote_supplierId_idx" ON "BidSupplierQuote"("supplierId");
CREATE INDEX IF NOT EXISTS "BidSupplierQuote_createdAt_idx" ON "BidSupplierQuote"("createdAt");

CREATE TABLE IF NOT EXISTS "BidApproval" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "approverName" TEXT NOT NULL,
  "approverEmail" TEXT,
  "role" TEXT,
  "status" "BidApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidApproval_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidApproval"
    ADD CONSTRAINT "BidApproval_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidApproval_opportunityId_idx" ON "BidApproval"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidApproval_status_idx" ON "BidApproval"("status");
CREATE INDEX IF NOT EXISTS "BidApproval_createdAt_idx" ON "BidApproval"("createdAt");

CREATE TABLE IF NOT EXISTS "BidActivity" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "type" "BidActivityType" NOT NULL DEFAULT 'NOTE',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "actorName" TEXT,
  "actorEmail" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidActivity_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidActivity"
    ADD CONSTRAINT "BidActivity_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidActivity_opportunityId_idx" ON "BidActivity"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidActivity_type_idx" ON "BidActivity"("type");
CREATE INDEX IF NOT EXISTS "BidActivity_createdAt_idx" ON "BidActivity"("createdAt");

CREATE TABLE IF NOT EXISTS "BidSubmissionChecklist" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "status" "BidChecklistStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMPTZ,
  "notes" TEXT,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidSubmissionChecklist_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidSubmissionChecklist"
    ADD CONSTRAINT "BidSubmissionChecklist_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidSubmissionChecklist"
    ADD CONSTRAINT "BidSubmissionChecklist_opportunityId_itemKey_key"
    UNIQUE ("opportunityId", "itemKey");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidSubmissionChecklist_opportunityId_idx" ON "BidSubmissionChecklist"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidSubmissionChecklist_status_idx" ON "BidSubmissionChecklist"("status");
CREATE INDEX IF NOT EXISTS "BidSubmissionChecklist_sortOrder_idx" ON "BidSubmissionChecklist"("sortOrder");
CREATE INDEX IF NOT EXISTS "BidSubmissionChecklist_createdAt_idx" ON "BidSubmissionChecklist"("createdAt");
