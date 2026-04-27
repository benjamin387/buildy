-- AI Action Runner logs (approval-gated execution trail).
-- Adds:
-- - AIAutomationMode enum (for runner modes)
-- - AIActionStatus enum
-- - AIActionLog table

DO $$ BEGIN
  CREATE TYPE "AIAutomationMode" AS ENUM ('MANUAL', 'ASSISTED', 'AUTO_SAFE', 'AUTO_FULL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AIActionStatus" AS ENUM ('PENDING', 'APPROVAL_REQUIRED', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AIActionLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "status" "AIActionStatus" NOT NULL DEFAULT 'PENDING',
  "requiresApproval" BOOLEAN NOT NULL DEFAULT FALSE,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AIActionLog_status_idx" ON "AIActionLog"("status");
CREATE INDEX IF NOT EXISTS "AIActionLog_action_idx" ON "AIActionLog"("action");
CREATE INDEX IF NOT EXISTS "AIActionLog_entity_idx" ON "AIActionLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AIActionLog_createdAt_idx" ON "AIActionLog"("createdAt");

