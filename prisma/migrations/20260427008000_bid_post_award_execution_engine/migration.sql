-- GeBIZ Post-Award Execution Engine (Budget Lock + Procurement Plan)
-- Additive changes only; no destructive operations.

DO $$ BEGIN
  CREATE TYPE "ProjectBudgetSourceType" AS ENUM ('BID_COST_VERSION', 'QUOTATION', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectBudgetStatus" AS ENUM ('DRAFT', 'LOCKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectProcurementPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectProcurementItemType" AS ENUM ('PURCHASE_ORDER', 'SUBCONTRACT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectProcurementItemStatus" AS ENUM (
    'PLANNED',
    'RFQ_SENT',
    'QUOTED',
    'AWARDED',
    'ORDERED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProjectBudget" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceType" "ProjectBudgetSourceType" NOT NULL DEFAULT 'MANUAL',
  "bidOpportunityId" TEXT,
  "bidCostVersionId" TEXT,
  "quotationId" TEXT,
  "createdFromBudgetId" TEXT,
  "versionNo" INT NOT NULL DEFAULT 1,
  "status" "ProjectBudgetStatus" NOT NULL DEFAULT 'DRAFT',
  "lockedAt" TIMESTAMPTZ,
  "lockedByName" TEXT,
  "lockedByEmail" TEXT,
  "unlockedAt" TIMESTAMPTZ,
  "unlockedByName" TEXT,
  "unlockedByEmail" TEXT,
  "unlockReason" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "totalCost" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "totalRevenue" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProjectBudget_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ProjectBudget"
    ADD CONSTRAINT "ProjectBudget_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectBudget"
    ADD CONSTRAINT "ProjectBudget_createdFromBudgetId_fkey"
    FOREIGN KEY ("createdFromBudgetId") REFERENCES "ProjectBudget"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectBudget"
    ADD CONSTRAINT "ProjectBudget_bidOpportunityId_fkey"
    FOREIGN KEY ("bidOpportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectBudget"
    ADD CONSTRAINT "ProjectBudget_bidCostVersionId_fkey"
    FOREIGN KEY ("bidCostVersionId") REFERENCES "BidCostVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectBudget"
    ADD CONSTRAINT "ProjectBudget_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectBudget"
    ADD CONSTRAINT "ProjectBudget_projectId_versionNo_key"
    UNIQUE ("projectId", "versionNo");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectBudget_projectId_idx" ON "ProjectBudget"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectBudget_sourceType_idx" ON "ProjectBudget"("sourceType");
CREATE INDEX IF NOT EXISTS "ProjectBudget_status_idx" ON "ProjectBudget"("status");
CREATE INDEX IF NOT EXISTS "ProjectBudget_lockedAt_idx" ON "ProjectBudget"("lockedAt");
CREATE INDEX IF NOT EXISTS "ProjectBudget_bidOpportunityId_idx" ON "ProjectBudget"("bidOpportunityId");
CREATE INDEX IF NOT EXISTS "ProjectBudget_bidCostVersionId_idx" ON "ProjectBudget"("bidCostVersionId");
CREATE INDEX IF NOT EXISTS "ProjectBudget_quotationId_idx" ON "ProjectBudget"("quotationId");
CREATE INDEX IF NOT EXISTS "ProjectBudget_createdFromBudgetId_idx" ON "ProjectBudget"("createdFromBudgetId");
CREATE INDEX IF NOT EXISTS "ProjectBudget_createdAt_idx" ON "ProjectBudget"("createdAt");

CREATE TABLE IF NOT EXISTS "ProjectBudgetLine" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "tradeKey" "BidTradePackageKey" NOT NULL,
  "description" TEXT NOT NULL,
  "costAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "revenueAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "sourceCostVersionLineId" TEXT,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProjectBudgetLine_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ProjectBudgetLine"
    ADD CONSTRAINT "ProjectBudgetLine_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "ProjectBudget"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectBudgetLine"
    ADD CONSTRAINT "ProjectBudgetLine_sourceCostVersionLineId_fkey"
    FOREIGN KEY ("sourceCostVersionLineId") REFERENCES "BidCostVersionLine"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectBudgetLine_budgetId_idx" ON "ProjectBudgetLine"("budgetId");
CREATE INDEX IF NOT EXISTS "ProjectBudgetLine_tradeKey_idx" ON "ProjectBudgetLine"("tradeKey");
CREATE INDEX IF NOT EXISTS "ProjectBudgetLine_sortOrder_idx" ON "ProjectBudgetLine"("sortOrder");
CREATE INDEX IF NOT EXISTS "ProjectBudgetLine_sourceCostVersionLineId_idx" ON "ProjectBudgetLine"("sourceCostVersionLineId");
CREATE INDEX IF NOT EXISTS "ProjectBudgetLine_createdAt_idx" ON "ProjectBudgetLine"("createdAt");

CREATE TABLE IF NOT EXISTS "ProjectProcurementPlan" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "bidOpportunityId" TEXT,
  "status" "ProjectProcurementPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProjectProcurementPlan_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ProjectProcurementPlan"
    ADD CONSTRAINT "ProjectProcurementPlan_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectProcurementPlan"
    ADD CONSTRAINT "ProjectProcurementPlan_bidOpportunityId_fkey"
    FOREIGN KEY ("bidOpportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectProcurementPlan_projectId_idx" ON "ProjectProcurementPlan"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlan_bidOpportunityId_idx" ON "ProjectProcurementPlan"("bidOpportunityId");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlan_status_idx" ON "ProjectProcurementPlan"("status");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlan_createdAt_idx" ON "ProjectProcurementPlan"("createdAt");

CREATE TABLE IF NOT EXISTS "ProjectProcurementPlanItem" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "tradeKey" "BidTradePackageKey" NOT NULL,
  "itemType" "ProjectProcurementItemType" NOT NULL DEFAULT 'SUBCONTRACT',
  "title" TEXT NOT NULL,
  "plannedVendorId" TEXT,
  "plannedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "committedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "committedAt" TIMESTAMPTZ,
  "committedByName" TEXT,
  "committedByEmail" TEXT,
  "plannedAwardDate" TIMESTAMPTZ,
  "plannedDeliveryDate" TIMESTAMPTZ,
  "status" "ProjectProcurementItemStatus" NOT NULL DEFAULT 'PLANNED',
  "purchaseOrderId" TEXT,
  "subcontractId" TEXT,
  "sourceBudgetLineId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProjectProcurementPlanItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ProjectProcurementPlanItem"
    ADD CONSTRAINT "ProjectProcurementPlanItem_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "ProjectProcurementPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectProcurementPlanItem"
    ADD CONSTRAINT "ProjectProcurementPlanItem_plannedVendorId_fkey"
    FOREIGN KEY ("plannedVendorId") REFERENCES "Vendor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectProcurementPlanItem"
    ADD CONSTRAINT "ProjectProcurementPlanItem_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectProcurementPlanItem"
    ADD CONSTRAINT "ProjectProcurementPlanItem_subcontractId_fkey"
    FOREIGN KEY ("subcontractId") REFERENCES "Subcontract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectProcurementPlanItem"
    ADD CONSTRAINT "ProjectProcurementPlanItem_sourceBudgetLineId_fkey"
    FOREIGN KEY ("sourceBudgetLineId") REFERENCES "ProjectBudgetLine"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_planId_idx" ON "ProjectProcurementPlanItem"("planId");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_tradeKey_idx" ON "ProjectProcurementPlanItem"("tradeKey");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_itemType_idx" ON "ProjectProcurementPlanItem"("itemType");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_status_idx" ON "ProjectProcurementPlanItem"("status");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_plannedAwardDate_idx" ON "ProjectProcurementPlanItem"("plannedAwardDate");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_plannedDeliveryDate_idx" ON "ProjectProcurementPlanItem"("plannedDeliveryDate");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_plannedVendorId_idx" ON "ProjectProcurementPlanItem"("plannedVendorId");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_purchaseOrderId_idx" ON "ProjectProcurementPlanItem"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_subcontractId_idx" ON "ProjectProcurementPlanItem"("subcontractId");
CREATE INDEX IF NOT EXISTS "ProjectProcurementPlanItem_sourceBudgetLineId_idx" ON "ProjectProcurementPlanItem"("sourceBudgetLineId");
