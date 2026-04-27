-- GeBIZ RSS Auto-Feed for Bidding Center

DO $$ BEGIN
  CREATE TYPE "GebizImportRunStatus" AS ENUM ('SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "GebizFeedSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rssUrl" TEXT NOT NULL,
  "procurementCategoryName" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "autoImport" BOOLEAN NOT NULL DEFAULT true,
  "defaultOwnerUserId" TEXT,
  "minimumEstimatedValue" NUMERIC(14,2),
  "keywordsInclude" TEXT,
  "keywordsExclude" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "GebizFeedSource_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "GebizFeedSource"
    ADD CONSTRAINT "GebizFeedSource_defaultOwnerUserId_fkey"
    FOREIGN KEY ("defaultOwnerUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "GebizFeedSource_isEnabled_idx" ON "GebizFeedSource"("isEnabled");
CREATE INDEX IF NOT EXISTS "GebizFeedSource_autoImport_idx" ON "GebizFeedSource"("autoImport");
CREATE INDEX IF NOT EXISTS "GebizFeedSource_createdAt_idx" ON "GebizFeedSource"("createdAt");

CREATE TABLE IF NOT EXISTS "GebizImportRun" (
  "id" TEXT NOT NULL,
  "feedSourceId" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "finishedAt" TIMESTAMPTZ,
  "status" "GebizImportRunStatus" NOT NULL DEFAULT 'SUCCESS',
  "message" TEXT,
  "itemsFetched" INT NOT NULL DEFAULT 0,
  "itemsCreated" INT NOT NULL DEFAULT 0,
  "itemsSkipped" INT NOT NULL DEFAULT 0,
  "errorsJson" JSONB,
  CONSTRAINT "GebizImportRun_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "GebizImportRun"
    ADD CONSTRAINT "GebizImportRun_feedSourceId_fkey"
    FOREIGN KEY ("feedSourceId") REFERENCES "GebizFeedSource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "GebizImportRun_feedSourceId_idx" ON "GebizImportRun"("feedSourceId");
CREATE INDEX IF NOT EXISTS "GebizImportRun_startedAt_idx" ON "GebizImportRun"("startedAt");
CREATE INDEX IF NOT EXISTS "GebizImportRun_status_idx" ON "GebizImportRun"("status");

CREATE TABLE IF NOT EXISTS "GebizImportedItem" (
  "id" TEXT NOT NULL,
  "feedSourceId" TEXT NOT NULL,
  "importRunId" TEXT,
  "opportunityNo" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "agency" TEXT,
  "publishedAt" TIMESTAMPTZ,
  "closingDate" TIMESTAMPTZ,
  "category" TEXT,
  "detailUrl" TEXT,
  "sourceGuid" TEXT,
  "estimatedValue" NUMERIC(14,2),
  "rawJson" JSONB,
  "bidOpportunityId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "GebizImportedItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "GebizImportedItem"
    ADD CONSTRAINT "GebizImportedItem_feedSourceId_fkey"
    FOREIGN KEY ("feedSourceId") REFERENCES "GebizFeedSource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GebizImportedItem"
    ADD CONSTRAINT "GebizImportedItem_importRunId_fkey"
    FOREIGN KEY ("importRunId") REFERENCES "GebizImportRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GebizImportedItem"
    ADD CONSTRAINT "GebizImportedItem_bidOpportunityId_fkey"
    FOREIGN KEY ("bidOpportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GebizImportedItem"
    ADD CONSTRAINT "GebizImportedItem_feedSourceId_opportunityNo_key"
    UNIQUE ("feedSourceId", "opportunityNo");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GebizImportedItem"
    ADD CONSTRAINT "GebizImportedItem_feedSourceId_detailUrl_key"
    UNIQUE ("feedSourceId", "detailUrl");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "GebizImportedItem_feedSourceId_idx" ON "GebizImportedItem"("feedSourceId");
CREATE INDEX IF NOT EXISTS "GebizImportedItem_importRunId_idx" ON "GebizImportedItem"("importRunId");
CREATE INDEX IF NOT EXISTS "GebizImportedItem_publishedAt_idx" ON "GebizImportedItem"("publishedAt");
CREATE INDEX IF NOT EXISTS "GebizImportedItem_closingDate_idx" ON "GebizImportedItem"("closingDate");
CREATE INDEX IF NOT EXISTS "GebizImportedItem_createdAt_idx" ON "GebizImportedItem"("createdAt");

