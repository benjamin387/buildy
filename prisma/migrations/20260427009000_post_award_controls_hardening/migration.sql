-- Post-Award Execution Engine Hardening
-- Strict controls for budget versioning, commitments, and execution risk alerts.
-- Additive / idempotent changes only.

-- Extend PnLAlertType (risk alerts for execution control).
DO $$ BEGIN
  ALTER TYPE "PnLAlertType" ADD VALUE IF NOT EXISTS 'OVER_COMMITMENT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "PnLAlertType" ADD VALUE IF NOT EXISTS 'BUDGET_OVERRUN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "PnLAlertType" ADD VALUE IF NOT EXISTS 'CASHFLOW_NEGATIVE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "PnLAlertType" ADD VALUE IF NOT EXISTS 'MISSING_APPROVAL';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Budget versioning fields (safe if ProjectBudget already has them).
ALTER TABLE "ProjectBudget"
  ADD COLUMN IF NOT EXISTS "createdFromBudgetId" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "unlockedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "unlockedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "unlockedByEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "unlockReason" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByName" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByEmail" TEXT;

DO $$ BEGIN
  ALTER TABLE "ProjectBudget"
    ADD CONSTRAINT "ProjectBudget_createdFromBudgetId_fkey"
    FOREIGN KEY ("createdFromBudgetId") REFERENCES "ProjectBudget"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectBudget_createdFromBudgetId_idx" ON "ProjectBudget"("createdFromBudgetId");
CREATE INDEX IF NOT EXISTS "ProjectBudget_projectId_isActive_idx" ON "ProjectBudget"("projectId", "isActive");

-- Procurement commitment tracking.
ALTER TABLE "ProjectProcurementPlanItem"
  ADD COLUMN IF NOT EXISTS "committedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "committedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "committedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "committedByEmail" TEXT;
