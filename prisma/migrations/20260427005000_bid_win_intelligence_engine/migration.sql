-- Win Intelligence & Strategy Engine (Bidding)
-- Additive changes only.

DO $$ BEGIN
  CREATE TYPE "BidStrategyMode" AS ENUM ('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidPricingPosition" AS ENUM ('UNDERCUT', 'MATCH', 'PREMIUM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidWinLossResult" AS ENUM ('WON', 'LOST', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidTimelineStatus" AS ENUM ('PENDING', 'COMPLETED', 'MISSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- BidOpportunity: agency profile, strategy fields
ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "agencyProfileId" TEXT;

ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "strategyMode" "BidStrategyMode" NOT NULL DEFAULT 'BALANCED';

ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "pricingPosition" "BidPricingPosition" NOT NULL DEFAULT 'MATCH';

ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "strategyNotes" TEXT;

CREATE INDEX IF NOT EXISTS "BidOpportunity_agencyProfileId_idx" ON "BidOpportunity"("agencyProfileId");

-- Agency profiles
CREATE TABLE IF NOT EXISTS "BidAgencyProfile" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sector" TEXT,
  "typicalCategories" TEXT,
  "notes" TEXT,
  "lastEngagedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidAgencyProfile_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidAgencyProfile"
    ADD CONSTRAINT "BidAgencyProfile_name_key" UNIQUE ("name");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidAgencyProfile_name_idx" ON "BidAgencyProfile"("name");
CREATE INDEX IF NOT EXISTS "BidAgencyProfile_sector_idx" ON "BidAgencyProfile"("sector");
CREATE INDEX IF NOT EXISTS "BidAgencyProfile_lastEngagedAt_idx" ON "BidAgencyProfile"("lastEngagedAt");

DO $$ BEGIN
  ALTER TABLE "BidOpportunity"
    ADD CONSTRAINT "BidOpportunity_agencyProfileId_fkey"
    FOREIGN KEY ("agencyProfileId") REFERENCES "BidAgencyProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tender timeline milestones
CREATE TABLE IF NOT EXISTS "BidTimelineMilestone" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "milestoneKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "dueDate" TIMESTAMPTZ,
  "status" "BidTimelineStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMPTZ,
  "notes" TEXT,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidTimelineMilestone_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidTimelineMilestone"
    ADD CONSTRAINT "BidTimelineMilestone_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidTimelineMilestone"
    ADD CONSTRAINT "BidTimelineMilestone_opportunityId_milestoneKey_key"
    UNIQUE ("opportunityId", "milestoneKey");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidTimelineMilestone_opportunityId_idx" ON "BidTimelineMilestone"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidTimelineMilestone_status_idx" ON "BidTimelineMilestone"("status");
CREATE INDEX IF NOT EXISTS "BidTimelineMilestone_dueDate_idx" ON "BidTimelineMilestone"("dueDate");
CREATE INDEX IF NOT EXISTS "BidTimelineMilestone_sortOrder_idx" ON "BidTimelineMilestone"("sortOrder");

-- Competitor master + per-bid competitor records
CREATE TABLE IF NOT EXISTS "BidCompetitor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "website" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidCompetitor_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidCompetitor"
    ADD CONSTRAINT "BidCompetitor_name_key" UNIQUE ("name");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidCompetitor_name_idx" ON "BidCompetitor"("name");

CREATE TABLE IF NOT EXISTS "BidCompetitorRecord" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "competitorId" TEXT,
  "competitorName" TEXT NOT NULL,
  "quotedPrice" NUMERIC(14,2),
  "isWinner" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidCompetitorRecord_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidCompetitorRecord"
    ADD CONSTRAINT "BidCompetitorRecord_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidCompetitorRecord"
    ADD CONSTRAINT "BidCompetitorRecord_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "BidCompetitor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidCompetitorRecord_opportunityId_idx" ON "BidCompetitorRecord"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidCompetitorRecord_competitorId_idx" ON "BidCompetitorRecord"("competitorId");
CREATE INDEX IF NOT EXISTS "BidCompetitorRecord_isWinner_idx" ON "BidCompetitorRecord"("isWinner");
CREATE INDEX IF NOT EXISTS "BidCompetitorRecord_createdAt_idx" ON "BidCompetitorRecord"("createdAt");

-- Win/Loss tracking
CREATE TABLE IF NOT EXISTS "BidWinLossRecord" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "result" "BidWinLossResult" NOT NULL,
  "awardedValue" NUMERIC(14,2),
  "decisionDate" TIMESTAMPTZ,
  "lostReason" TEXT,
  "winReason" TEXT,
  "competitorSummary" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidWinLossRecord_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidWinLossRecord"
    ADD CONSTRAINT "BidWinLossRecord_opportunityId_key" UNIQUE ("opportunityId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidWinLossRecord"
    ADD CONSTRAINT "BidWinLossRecord_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidWinLossRecord_result_idx" ON "BidWinLossRecord"("result");
CREATE INDEX IF NOT EXISTS "BidWinLossRecord_decisionDate_idx" ON "BidWinLossRecord"("decisionDate");
CREATE INDEX IF NOT EXISTS "BidWinLossRecord_createdAt_idx" ON "BidWinLossRecord"("createdAt");

