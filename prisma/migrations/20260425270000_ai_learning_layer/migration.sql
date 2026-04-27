-- AI Learning Layer
-- Adds:
-- - AIOutcomeType enum, AIOutcomeStatus enum
-- - AIOutcome table (links to AIActionLog)
-- - AILearningMetric table (aggregations)
-- - AIRecommendationScore table (action scoring)

DO $$ BEGIN
  CREATE TYPE "AIOutcomeType" AS ENUM (
    'LEAD_CONVERSION',
    'QUOTATION_ACCEPTANCE',
    'UPSELL_ACCEPTANCE',
    'PAYMENT_COLLECTION',
    'MARGIN_IMPROVEMENT',
    'DESIGN_ACCEPTANCE',
    'PROJECT_DELAY_REDUCTION'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AIOutcomeStatus" AS ENUM ('SUCCESS', 'FAILED', 'NEUTRAL', 'PENDING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AIOutcome" (
  "id" TEXT NOT NULL,
  "actionLogId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "outcomeType" "AIOutcomeType" NOT NULL,
  "outcomeStatus" "AIOutcomeStatus" NOT NULL DEFAULT 'PENDING',
  "measuredAt" TIMESTAMP(3) NOT NULL,
  "valueBefore" DECIMAL(18,2),
  "valueAfter" DECIMAL(18,2),
  "impactAmount" DECIMAL(18,2),
  "impactPercent" DECIMAL(6,3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIOutcome_pkey" PRIMARY KEY ("id")
);

-- One outcome per AIActionLog (nullable allows manual outcomes too)
CREATE UNIQUE INDEX IF NOT EXISTS "AIOutcome_actionLogId_key" ON "AIOutcome"("actionLogId");

-- Link outcome to AIActionLog if available
DO $$ BEGIN
  ALTER TABLE "AIOutcome"
    ADD CONSTRAINT "AIOutcome_actionLogId_fkey"
    FOREIGN KEY ("actionLogId") REFERENCES "AIActionLog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "AIOutcome_entity_idx" ON "AIOutcome"("entityType","entityId");
CREATE INDEX IF NOT EXISTS "AIOutcome_type_idx" ON "AIOutcome"("outcomeType");
CREATE INDEX IF NOT EXISTS "AIOutcome_status_idx" ON "AIOutcome"("outcomeStatus");
CREATE INDEX IF NOT EXISTS "AIOutcome_measuredAt_idx" ON "AIOutcome"("measuredAt");

CREATE TABLE IF NOT EXISTS "AILearningMetric" (
  "id" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "entityType" TEXT,
  "segmentKey" TEXT,
  "sampleSize" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "conversionRate" DECIMAL(6,4),
  "averageImpactAmount" DECIMAL(18,2),
  "averageImpactPercent" DECIMAL(6,3),
  "lastCalculatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AILearningMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AILearningMetric_metricKey_entityType_segmentKey_key"
  ON "AILearningMetric"("metricKey","entityType","segmentKey");
CREATE INDEX IF NOT EXISTS "AILearningMetric_metricKey_idx" ON "AILearningMetric"("metricKey");
CREATE INDEX IF NOT EXISTS "AILearningMetric_entityType_idx" ON "AILearningMetric"("entityType");
CREATE INDEX IF NOT EXISTS "AILearningMetric_segmentKey_idx" ON "AILearningMetric"("segmentKey");
CREATE INDEX IF NOT EXISTS "AILearningMetric_lastCalculatedAt_idx" ON "AILearningMetric"("lastCalculatedAt");

CREATE TABLE IF NOT EXISTS "AIRecommendationScore" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "segmentKey" TEXT,
  "confidenceScore" DECIMAL(6,4) NOT NULL,
  "successRate" DECIMAL(6,4) NOT NULL,
  "averageImpactAmount" DECIMAL(18,2),
  "sampleSize" INTEGER NOT NULL DEFAULT 0,
  "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIRecommendationScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AIRecommendationScore_action_entityType_segmentKey_key"
  ON "AIRecommendationScore"("action","entityType","segmentKey");
CREATE INDEX IF NOT EXISTS "AIRecommendationScore_action_idx" ON "AIRecommendationScore"("action");
CREATE INDEX IF NOT EXISTS "AIRecommendationScore_entityType_idx" ON "AIRecommendationScore"("entityType");
CREATE INDEX IF NOT EXISTS "AIRecommendationScore_segmentKey_idx" ON "AIRecommendationScore"("segmentKey");
CREATE INDEX IF NOT EXISTS "AIRecommendationScore_lastUpdatedAt_idx" ON "AIRecommendationScore"("lastUpdatedAt");

