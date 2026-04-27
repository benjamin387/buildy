-- Cashflow forecast engine (snapshots + lines) - incremental and safe.

DO $$ BEGIN
  CREATE TYPE "CashflowDirection" AS ENUM ('INFLOW', 'OUTFLOW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CashflowRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CashflowLineStatus" AS ENUM ('EXPECTED', 'CONFIRMED', 'RECEIVED', 'PAID', 'OVERDUE', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CashflowForecastSnapshot" (
  "id" TEXT NOT NULL,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "projectId" TEXT,
  "forecastStartDate" TIMESTAMP(3) NOT NULL,
  "forecastEndDate" TIMESTAMP(3) NOT NULL,
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "expectedInflows" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "expectedOutflows" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "netCashflow" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "projectedClosingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "riskLevel" "CashflowRiskLevel" NOT NULL DEFAULT 'LOW',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashflowForecastSnapshot_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "CashflowForecastSnapshot"
    ADD CONSTRAINT "CashflowForecastSnapshot_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "CashflowForecastSnapshot_snapshotDate_idx" ON "CashflowForecastSnapshot"("snapshotDate");
CREATE INDEX IF NOT EXISTS "CashflowForecastSnapshot_projectId_idx" ON "CashflowForecastSnapshot"("projectId");
CREATE INDEX IF NOT EXISTS "CashflowForecastSnapshot_forecastStartDate_idx" ON "CashflowForecastSnapshot"("forecastStartDate");
CREATE INDEX IF NOT EXISTS "CashflowForecastSnapshot_forecastEndDate_idx" ON "CashflowForecastSnapshot"("forecastEndDate");
CREATE INDEX IF NOT EXISTS "CashflowForecastSnapshot_riskLevel_idx" ON "CashflowForecastSnapshot"("riskLevel");
CREATE INDEX IF NOT EXISTS "CashflowForecastSnapshot_createdAt_idx" ON "CashflowForecastSnapshot"("createdAt");
CREATE INDEX IF NOT EXISTS "CashflowForecastSnapshot_projectId_snapshotDate_idx" ON "CashflowForecastSnapshot"("projectId", "snapshotDate");

CREATE TABLE IF NOT EXISTS "CashflowForecastLine" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "projectId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "direction" "CashflowDirection" NOT NULL,
  "label" TEXT NOT NULL,
  "expectedDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "confidenceLevel" DECIMAL(7,4) NOT NULL DEFAULT 0.5,
  "status" "CashflowLineStatus" NOT NULL DEFAULT 'EXPECTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashflowForecastLine_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "CashflowForecastLine"
    ADD CONSTRAINT "CashflowForecastLine_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "CashflowForecastSnapshot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CashflowForecastLine"
    ADD CONSTRAINT "CashflowForecastLine_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "CashflowForecastLine_snapshotId_idx" ON "CashflowForecastLine"("snapshotId");
CREATE INDEX IF NOT EXISTS "CashflowForecastLine_projectId_idx" ON "CashflowForecastLine"("projectId");
CREATE INDEX IF NOT EXISTS "CashflowForecastLine_sourceType_idx" ON "CashflowForecastLine"("sourceType");
CREATE INDEX IF NOT EXISTS "CashflowForecastLine_sourceId_idx" ON "CashflowForecastLine"("sourceId");
CREATE INDEX IF NOT EXISTS "CashflowForecastLine_direction_idx" ON "CashflowForecastLine"("direction");
CREATE INDEX IF NOT EXISTS "CashflowForecastLine_expectedDate_idx" ON "CashflowForecastLine"("expectedDate");
CREATE INDEX IF NOT EXISTS "CashflowForecastLine_status_idx" ON "CashflowForecastLine"("status");
CREATE INDEX IF NOT EXISTS "CashflowForecastLine_createdAt_idx" ON "CashflowForecastLine"("createdAt");
CREATE INDEX IF NOT EXISTS "CashflowForecastLine_direction_expectedDate_idx" ON "CashflowForecastLine"("direction", "expectedDate");

