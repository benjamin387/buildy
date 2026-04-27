-- Progress Claim, Retention, Defect Liability Period (DLP), and Final Account Engine
-- Additive / idempotent changes only.

-- Enums
DO $$ BEGIN
  CREATE TYPE "ProgressClaimStatus" AS ENUM ('DRAFT','SUBMITTED','CERTIFIED','APPROVED','REJECTED','INVOICED','PAID','CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProgressClaimMethod" AS ENUM ('PERCENTAGE','MILESTONE','BUDGET_LINE','MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProgressClaimApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RetentionEntryType" AS ENUM ('DEDUCTION','RELEASE_PRACTICAL_COMPLETION','RELEASE_FINAL','ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DefectReportStatus" AS ENUM ('OPEN','IN_PROGRESS','RECTIFIED','CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinalAccountStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','LOCKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinalAccountApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Extend JobContract for retention percent.
ALTER TABLE "JobContract"
  ADD COLUMN IF NOT EXISTS "retentionPercent" NUMERIC(7,4) NOT NULL DEFAULT 0;

-- Extend Invoice to link to progress claims.
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "progressClaimId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_progressClaimId_fkey"
    FOREIGN KEY ("progressClaimId") REFERENCES "ProgressClaim"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Invoice_progressClaimId_idx" ON "Invoice"("progressClaimId");
-- NOTE:
-- Do NOT enforce uniqueness on progressClaimId.
-- One progress claim may generate multiple invoices (partial billing / adjustments).

-- ProgressClaim
CREATE TABLE IF NOT EXISTS "ProgressClaim" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contractId" TEXT,
  "budgetId" TEXT,
  "claimNumber" TEXT NOT NULL,
  "claimMethod" "ProgressClaimMethod" NOT NULL DEFAULT 'MANUAL',
  "claimDate" TIMESTAMPTZ NOT NULL,
  "periodStart" TIMESTAMPTZ,
  "periodEnd" TIMESTAMPTZ,
  "percentComplete" NUMERIC(7,4),
  "claimedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "certifiedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "retentionDeductedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "netCertifiedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "status" "ProgressClaimStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMPTZ,
  "certifiedAt" TIMESTAMPTZ,
  "approvedAt" TIMESTAMPTZ,
  "rejectedAt" TIMESTAMPTZ,
  "remarks" TEXT,
  "internalNotes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ProgressClaim_pkey" PRIMARY KEY ("id")
);

-- Now that ProgressClaim exists, ensure the Invoice FK is present (first attempt may have been skipped).
DO $$ BEGIN
  ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_progressClaimId_fkey"
    FOREIGN KEY ("progressClaimId") REFERENCES "ProgressClaim"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProgressClaim"
    ADD CONSTRAINT "ProgressClaim_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProgressClaim"
    ADD CONSTRAINT "ProgressClaim_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProgressClaim"
    ADD CONSTRAINT "ProgressClaim_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "ProjectBudget"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ProgressClaim_claimNumber_key" ON "ProgressClaim"("claimNumber");
CREATE INDEX IF NOT EXISTS "ProgressClaim_projectId_idx" ON "ProgressClaim"("projectId");
CREATE INDEX IF NOT EXISTS "ProgressClaim_contractId_idx" ON "ProgressClaim"("contractId");
CREATE INDEX IF NOT EXISTS "ProgressClaim_budgetId_idx" ON "ProgressClaim"("budgetId");
CREATE INDEX IF NOT EXISTS "ProgressClaim_claimDate_idx" ON "ProgressClaim"("claimDate");
CREATE INDEX IF NOT EXISTS "ProgressClaim_status_idx" ON "ProgressClaim"("status");

-- ProgressClaimLine
CREATE TABLE IF NOT EXISTS "ProgressClaimLine" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "budgetLineId" TEXT,
  "contractMilestoneId" TEXT,
  "claimedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "certifiedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ProgressClaimLine_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ProgressClaimLine"
    ADD CONSTRAINT "ProgressClaimLine_claimId_fkey"
    FOREIGN KEY ("claimId") REFERENCES "ProgressClaim"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProgressClaimLine"
    ADD CONSTRAINT "ProgressClaimLine_budgetLineId_fkey"
    FOREIGN KEY ("budgetLineId") REFERENCES "ProjectBudgetLine"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProgressClaimLine"
    ADD CONSTRAINT "ProgressClaimLine_contractMilestoneId_fkey"
    FOREIGN KEY ("contractMilestoneId") REFERENCES "ContractMilestone"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ProgressClaimLine_claimId_idx" ON "ProgressClaimLine"("claimId");
CREATE INDEX IF NOT EXISTS "ProgressClaimLine_budgetLineId_idx" ON "ProgressClaimLine"("budgetLineId");
CREATE INDEX IF NOT EXISTS "ProgressClaimLine_contractMilestoneId_idx" ON "ProgressClaimLine"("contractMilestoneId");
CREATE INDEX IF NOT EXISTS "ProgressClaimLine_sortOrder_idx" ON "ProgressClaimLine"("sortOrder");

-- ProgressClaimApproval
CREATE TABLE IF NOT EXISTS "ProgressClaimApproval" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "approverName" TEXT,
  "approverEmail" TEXT,
  "status" "ProgressClaimApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "actedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ProgressClaimApproval_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ProgressClaimApproval"
    ADD CONSTRAINT "ProgressClaimApproval_claimId_fkey"
    FOREIGN KEY ("claimId") REFERENCES "ProgressClaim"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ProgressClaimApproval_claimId_roleKey_key" ON "ProgressClaimApproval"("claimId","roleKey");
CREATE INDEX IF NOT EXISTS "ProgressClaimApproval_claimId_idx" ON "ProgressClaimApproval"("claimId");
CREATE INDEX IF NOT EXISTS "ProgressClaimApproval_status_idx" ON "ProgressClaimApproval"("status");
CREATE INDEX IF NOT EXISTS "ProgressClaimApproval_actedAt_idx" ON "ProgressClaimApproval"("actedAt");

-- RetentionLedger
CREATE TABLE IF NOT EXISTS "RetentionLedger" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contractId" TEXT,
  "progressClaimId" TEXT,
  "invoiceId" TEXT,
  "entryType" "RetentionEntryType" NOT NULL,
  "entryDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "RetentionLedger_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "RetentionLedger"
    ADD CONSTRAINT "RetentionLedger_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RetentionLedger"
    ADD CONSTRAINT "RetentionLedger_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RetentionLedger"
    ADD CONSTRAINT "RetentionLedger_progressClaimId_fkey"
    FOREIGN KEY ("progressClaimId") REFERENCES "ProgressClaim"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RetentionLedger"
    ADD CONSTRAINT "RetentionLedger_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "RetentionLedger_projectId_idx" ON "RetentionLedger"("projectId");
CREATE INDEX IF NOT EXISTS "RetentionLedger_contractId_idx" ON "RetentionLedger"("contractId");
CREATE INDEX IF NOT EXISTS "RetentionLedger_progressClaimId_idx" ON "RetentionLedger"("progressClaimId");
CREATE INDEX IF NOT EXISTS "RetentionLedger_invoiceId_idx" ON "RetentionLedger"("invoiceId");
CREATE INDEX IF NOT EXISTS "RetentionLedger_entryType_idx" ON "RetentionLedger"("entryType");
CREATE INDEX IF NOT EXISTS "RetentionLedger_entryDate_idx" ON "RetentionLedger"("entryDate");

-- DefectLiabilityPeriod
CREATE TABLE IF NOT EXISTS "DefectLiabilityPeriod" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contractId" TEXT,
  "startDate" TIMESTAMPTZ NOT NULL,
  "endDate" TIMESTAMPTZ NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "DefectLiabilityPeriod_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "DefectLiabilityPeriod"
    ADD CONSTRAINT "DefectLiabilityPeriod_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DefectLiabilityPeriod"
    ADD CONSTRAINT "DefectLiabilityPeriod_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DefectLiabilityPeriod_projectId_key" ON "DefectLiabilityPeriod"("projectId");
CREATE INDEX IF NOT EXISTS "DefectLiabilityPeriod_contractId_idx" ON "DefectLiabilityPeriod"("contractId");
CREATE INDEX IF NOT EXISTS "DefectLiabilityPeriod_startDate_idx" ON "DefectLiabilityPeriod"("startDate");
CREATE INDEX IF NOT EXISTS "DefectLiabilityPeriod_endDate_idx" ON "DefectLiabilityPeriod"("endDate");

-- DefectReport
CREATE TABLE IF NOT EXISTS "DefectReport" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "dlpId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "reportedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "status" "DefectReportStatus" NOT NULL DEFAULT 'OPEN',
  "rectifiedAt" TIMESTAMPTZ,
  "rectificationCost" NUMERIC(14,2),
  "responsibleVendorId" TEXT,
  "responsibleSubcontractId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "DefectReport_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "DefectReport"
    ADD CONSTRAINT "DefectReport_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DefectReport"
    ADD CONSTRAINT "DefectReport_dlpId_fkey"
    FOREIGN KEY ("dlpId") REFERENCES "DefectLiabilityPeriod"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DefectReport"
    ADD CONSTRAINT "DefectReport_responsibleVendorId_fkey"
    FOREIGN KEY ("responsibleVendorId") REFERENCES "Vendor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DefectReport"
    ADD CONSTRAINT "DefectReport_responsibleSubcontractId_fkey"
    FOREIGN KEY ("responsibleSubcontractId") REFERENCES "Subcontract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "DefectReport_projectId_idx" ON "DefectReport"("projectId");
CREATE INDEX IF NOT EXISTS "DefectReport_dlpId_idx" ON "DefectReport"("dlpId");
CREATE INDEX IF NOT EXISTS "DefectReport_status_idx" ON "DefectReport"("status");
CREATE INDEX IF NOT EXISTS "DefectReport_reportedAt_idx" ON "DefectReport"("reportedAt");
CREATE INDEX IF NOT EXISTS "DefectReport_rectifiedAt_idx" ON "DefectReport"("rectifiedAt");
CREATE INDEX IF NOT EXISTS "DefectReport_responsibleVendorId_idx" ON "DefectReport"("responsibleVendorId");
CREATE INDEX IF NOT EXISTS "DefectReport_responsibleSubcontractId_idx" ON "DefectReport"("responsibleSubcontractId");

-- FinalAccount
CREATE TABLE IF NOT EXISTS "FinalAccount" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contractId" TEXT,
  "status" "FinalAccountStatus" NOT NULL DEFAULT 'DRAFT',
  "originalContractSum" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "approvedVariationSum" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "certifiedClaimsSum" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "retentionHeldSum" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "retentionReleasedSum" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "outstandingBalance" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMPTZ,
  "lockedByName" TEXT,
  "lockedByEmail" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "FinalAccount_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "FinalAccount"
    ADD CONSTRAINT "FinalAccount_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FinalAccount"
    ADD CONSTRAINT "FinalAccount_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "FinalAccount_projectId_key" ON "FinalAccount"("projectId");
CREATE INDEX IF NOT EXISTS "FinalAccount_contractId_idx" ON "FinalAccount"("contractId");
CREATE INDEX IF NOT EXISTS "FinalAccount_status_idx" ON "FinalAccount"("status");
CREATE INDEX IF NOT EXISTS "FinalAccount_lockedAt_idx" ON "FinalAccount"("lockedAt");

-- FinalAccountLine
CREATE TABLE IF NOT EXISTS "FinalAccountLine" (
  "id" TEXT NOT NULL,
  "finalAccountId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "FinalAccountLine_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "FinalAccountLine"
    ADD CONSTRAINT "FinalAccountLine_finalAccountId_fkey"
    FOREIGN KEY ("finalAccountId") REFERENCES "FinalAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "FinalAccountLine_finalAccountId_idx" ON "FinalAccountLine"("finalAccountId");
CREATE INDEX IF NOT EXISTS "FinalAccountLine_sortOrder_idx" ON "FinalAccountLine"("sortOrder");

-- FinalAccountApproval
CREATE TABLE IF NOT EXISTS "FinalAccountApproval" (
  "id" TEXT NOT NULL,
  "finalAccountId" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "approverName" TEXT,
  "approverEmail" TEXT,
  "status" "FinalAccountApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "actedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "FinalAccountApproval_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "FinalAccountApproval"
    ADD CONSTRAINT "FinalAccountApproval_finalAccountId_fkey"
    FOREIGN KEY ("finalAccountId") REFERENCES "FinalAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "FinalAccountApproval_finalAccountId_roleKey_key" ON "FinalAccountApproval"("finalAccountId","roleKey");
CREATE INDEX IF NOT EXISTS "FinalAccountApproval_finalAccountId_idx" ON "FinalAccountApproval"("finalAccountId");
CREATE INDEX IF NOT EXISTS "FinalAccountApproval_status_idx" ON "FinalAccountApproval"("status");
CREATE INDEX IF NOT EXISTS "FinalAccountApproval_actedAt_idx" ON "FinalAccountApproval"("actedAt");
