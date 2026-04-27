-- Site visit + requirement capture engine (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "SiteVisitStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SiteVisit" (
  "id" TEXT NOT NULL,
  "leadId" TEXT,
  "projectId" TEXT,
  "status" "SiteVisitStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "addressSnapshot" TEXT NOT NULL,
  "assignedSalesName" TEXT,
  "assignedSalesEmail" TEXT,
  "assignedDesignerName" TEXT,
  "assignedDesignerEmail" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SiteVisit_leadId_idx" ON "SiteVisit"("leadId");
CREATE INDEX IF NOT EXISTS "SiteVisit_projectId_idx" ON "SiteVisit"("projectId");
CREATE INDEX IF NOT EXISTS "SiteVisit_status_idx" ON "SiteVisit"("status");
CREATE INDEX IF NOT EXISTS "SiteVisit_scheduledAt_idx" ON "SiteVisit"("scheduledAt");
CREATE INDEX IF NOT EXISTS "SiteVisit_completedAt_idx" ON "SiteVisit"("completedAt");
CREATE INDEX IF NOT EXISTS "SiteVisit_assignedSalesEmail_idx" ON "SiteVisit"("assignedSalesEmail");
CREATE INDEX IF NOT EXISTS "SiteVisit_assignedDesignerEmail_idx" ON "SiteVisit"("assignedDesignerEmail");
CREATE INDEX IF NOT EXISTS "SiteVisit_createdAt_idx" ON "SiteVisit"("createdAt");

DO $$ BEGIN
  ALTER TABLE "SiteVisit"
    ADD CONSTRAINT "SiteVisit_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SiteVisit"
    ADD CONSTRAINT "SiteVisit_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SiteVisitArea" (
  "id" TEXT NOT NULL,
  "siteVisitId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteVisitArea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SiteVisitArea_siteVisitId_idx" ON "SiteVisitArea"("siteVisitId");
CREATE INDEX IF NOT EXISTS "SiteVisitArea_sortOrder_idx" ON "SiteVisitArea"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "SiteVisitArea"
    ADD CONSTRAINT "SiteVisitArea_siteVisitId_fkey"
    FOREIGN KEY ("siteVisitId") REFERENCES "SiteVisit"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MeasurementNote" (
  "id" TEXT NOT NULL,
  "siteVisitId" TEXT NOT NULL,
  "areaId" TEXT,
  "title" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "unit" TEXT,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeasurementNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeasurementNote_siteVisitId_idx" ON "MeasurementNote"("siteVisitId");
CREATE INDEX IF NOT EXISTS "MeasurementNote_areaId_idx" ON "MeasurementNote"("areaId");
CREATE INDEX IF NOT EXISTS "MeasurementNote_sortOrder_idx" ON "MeasurementNote"("sortOrder");
CREATE INDEX IF NOT EXISTS "MeasurementNote_createdAt_idx" ON "MeasurementNote"("createdAt");

DO $$ BEGIN
  ALTER TABLE "MeasurementNote"
    ADD CONSTRAINT "MeasurementNote_siteVisitId_fkey"
    FOREIGN KEY ("siteVisitId") REFERENCES "SiteVisit"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MeasurementNote"
    ADD CONSTRAINT "MeasurementNote_areaId_fkey"
    FOREIGN KEY ("areaId") REFERENCES "SiteVisitArea"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SitePhoto" (
  "id" TEXT NOT NULL,
  "siteVisitId" TEXT NOT NULL,
  "areaId" TEXT,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT,
  "caption" TEXT,
  "takenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SitePhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SitePhoto_siteVisitId_idx" ON "SitePhoto"("siteVisitId");
CREATE INDEX IF NOT EXISTS "SitePhoto_areaId_idx" ON "SitePhoto"("areaId");
CREATE INDEX IF NOT EXISTS "SitePhoto_createdAt_idx" ON "SitePhoto"("createdAt");

DO $$ BEGIN
  ALTER TABLE "SitePhoto"
    ADD CONSTRAINT "SitePhoto_siteVisitId_fkey"
    FOREIGN KEY ("siteVisitId") REFERENCES "SiteVisit"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SitePhoto"
    ADD CONSTRAINT "SitePhoto_areaId_fkey"
    FOREIGN KEY ("areaId") REFERENCES "SiteVisitArea"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "RequirementChecklist" (
  "id" TEXT NOT NULL,
  "siteVisitId" TEXT NOT NULL,
  "items" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequirementChecklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RequirementChecklist_siteVisitId_key" ON "RequirementChecklist"("siteVisitId");
CREATE INDEX IF NOT EXISTS "RequirementChecklist_createdAt_idx" ON "RequirementChecklist"("createdAt");

DO $$ BEGIN
  ALTER TABLE "RequirementChecklist"
    ADD CONSTRAINT "RequirementChecklist_siteVisitId_fkey"
    FOREIGN KEY ("siteVisitId") REFERENCES "SiteVisit"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BudgetRange" (
  "id" TEXT NOT NULL,
  "siteVisitId" TEXT NOT NULL,
  "minAmount" DECIMAL(14,2),
  "maxAmount" DECIMAL(14,2),
  "currency" TEXT NOT NULL DEFAULT 'SGD',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetRange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BudgetRange_siteVisitId_key" ON "BudgetRange"("siteVisitId");

DO $$ BEGIN
  ALTER TABLE "BudgetRange"
    ADD CONSTRAINT "BudgetRange_siteVisitId_fkey"
    FOREIGN KEY ("siteVisitId") REFERENCES "SiteVisit"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TimelineExpectation" (
  "id" TEXT NOT NULL,
  "siteVisitId" TEXT NOT NULL,
  "desiredStartDate" TIMESTAMP(3),
  "desiredCompletionDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimelineExpectation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TimelineExpectation_siteVisitId_key" ON "TimelineExpectation"("siteVisitId");

DO $$ BEGIN
  ALTER TABLE "TimelineExpectation"
    ADD CONSTRAINT "TimelineExpectation_siteVisitId_fkey"
    FOREIGN KEY ("siteVisitId") REFERENCES "SiteVisit"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

