-- AI Sales Assistant (incremental + safe).

-- Enums.
DO $$ BEGIN
  CREATE TYPE "AISalesInsightType" AS ENUM (
    'LEAD_QUALITY',
    'NEXT_ACTION',
    'PRICING',
    'UPSELL',
    'OBJECTION_HANDLING',
    'REQUIREMENT_SUMMARY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AISalesStatus" AS ENUM ('DRAFT', 'REVIEWED', 'APPROVED', 'SENT', 'DISMISSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Insights.
CREATE TABLE IF NOT EXISTS "AISalesInsight" (
  "id" TEXT NOT NULL,
  "leadId" TEXT,
  "projectId" TEXT,
  "insightType" "AISalesInsightType" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendation" TEXT,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "AISalesStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AISalesInsight_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "AISalesInsight"
    ADD CONSTRAINT "AISalesInsight_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AISalesInsight"
    ADD CONSTRAINT "AISalesInsight_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "AISalesInsight_leadId_idx" ON "AISalesInsight"("leadId");
CREATE INDEX IF NOT EXISTS "AISalesInsight_projectId_idx" ON "AISalesInsight"("projectId");
CREATE INDEX IF NOT EXISTS "AISalesInsight_insightType_idx" ON "AISalesInsight"("insightType");
CREATE INDEX IF NOT EXISTS "AISalesInsight_status_idx" ON "AISalesInsight"("status");
CREATE INDEX IF NOT EXISTS "AISalesInsight_createdAt_idx" ON "AISalesInsight"("createdAt");

-- Message drafts.
CREATE TABLE IF NOT EXISTS "AISalesMessageDraft" (
  "id" TEXT NOT NULL,
  "leadId" TEXT,
  "projectId" TEXT,
  "channel" "MessageChannel" NOT NULL,
  "recipientName" TEXT,
  "recipientContact" TEXT,
  "purpose" TEXT NOT NULL,
  "messageBody" TEXT NOT NULL,
  "status" "AISalesStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AISalesMessageDraft_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "AISalesMessageDraft"
    ADD CONSTRAINT "AISalesMessageDraft_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AISalesMessageDraft"
    ADD CONSTRAINT "AISalesMessageDraft_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "AISalesMessageDraft_leadId_idx" ON "AISalesMessageDraft"("leadId");
CREATE INDEX IF NOT EXISTS "AISalesMessageDraft_projectId_idx" ON "AISalesMessageDraft"("projectId");
CREATE INDEX IF NOT EXISTS "AISalesMessageDraft_channel_idx" ON "AISalesMessageDraft"("channel");
CREATE INDEX IF NOT EXISTS "AISalesMessageDraft_status_idx" ON "AISalesMessageDraft"("status");
CREATE INDEX IF NOT EXISTS "AISalesMessageDraft_createdAt_idx" ON "AISalesMessageDraft"("createdAt");

