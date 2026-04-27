-- AI Autonomous Workflow Engine foundation
-- - Adds automation mode setting (manual/assisted/auto)
-- - Adds audit log for AI decisions and executed actions

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE "AutomationMode" AS ENUM ('MANUAL', 'ASSISTED', 'AUTO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationEntityType" AS ENUM ('LEAD', 'DESIGN_BRIEF', 'QUOTATION', 'INVOICE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationActionType" AS ENUM ('LEAD_FOLLOW_UP', 'QUOTATION_REMINDER', 'INVOICE_OVERDUE_CASE', 'GENERATE_SALES_PACKAGE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AutomationActionStatus" AS ENUM ('SUGGESTED', 'DRAFT_CREATED', 'EXECUTED', 'SKIPPED', 'REQUIRES_APPROVAL', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Settings
CREATE TABLE IF NOT EXISTS "AutomationSetting" (
  "id" TEXT NOT NULL,
  "mode" "AutomationMode" NOT NULL DEFAULT 'MANUAL',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "requireApprovalCritical" BOOLEAN NOT NULL DEFAULT TRUE,
  "allowAutoExternalSend" BOOLEAN NOT NULL DEFAULT FALSE,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationSetting_pkey" PRIMARY KEY ("id")
);

-- 3) Logs
CREATE TABLE IF NOT EXISTS "AutomationActionLog" (
  "id" TEXT NOT NULL,
  "entityType" "AutomationEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "actionType" "AutomationActionType" NOT NULL,
  "mode" "AutomationMode" NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "confidence" DECIMAL(4,3) NOT NULL DEFAULT 0,
  "reasoning" TEXT NOT NULL,
  "payload" JSONB,
  "status" "AutomationActionStatus" NOT NULL DEFAULT 'SUGGESTED',
  "outcome" TEXT,
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationActionLog_entity_idx" ON "AutomationActionLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AutomationActionLog_actionType_idx" ON "AutomationActionLog"("actionType");
CREATE INDEX IF NOT EXISTS "AutomationActionLog_status_idx" ON "AutomationActionLog"("status");
CREATE INDEX IF NOT EXISTS "AutomationActionLog_createdAt_idx" ON "AutomationActionLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AutomationActionLog_executedAt_idx" ON "AutomationActionLog"("executedAt");

