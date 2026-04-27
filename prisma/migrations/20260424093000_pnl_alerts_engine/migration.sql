-- P&L Intelligence: alert persistence for decision engine.
-- Incremental + safe: adds new enums and creates PnLAlert table.

DO $$ BEGIN
  CREATE TYPE "PnLAlertType" AS ENUM ('MARGIN_DROP', 'COST_OVERRUN', 'OVERDUE_INVOICE', 'UNPAID_SUPPLIER_BILL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PnLAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PnLAlert" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "type" "PnLAlertType" NOT NULL,
  "severity" "PnLAlertSeverity" NOT NULL DEFAULT 'LOW',
  "message" TEXT NOT NULL,
  "isResolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PnLAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PnLAlert_projectId_idx" ON "PnLAlert"("projectId");
CREATE INDEX IF NOT EXISTS "PnLAlert_projectId_isResolved_idx" ON "PnLAlert"("projectId", "isResolved");
CREATE INDEX IF NOT EXISTS "PnLAlert_type_idx" ON "PnLAlert"("type");
CREATE INDEX IF NOT EXISTS "PnLAlert_severity_idx" ON "PnLAlert"("severity");
CREATE INDEX IF NOT EXISTS "PnLAlert_createdAt_idx" ON "PnLAlert"("createdAt");

DO $$ BEGIN
  ALTER TABLE "PnLAlert"
    ADD CONSTRAINT "PnLAlert_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

