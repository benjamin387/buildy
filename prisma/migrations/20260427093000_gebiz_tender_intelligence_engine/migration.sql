-- GeBIZ Tender Intelligence Engine

DO $$ BEGIN
  CREATE TYPE "BidFitLabel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "fitScore" INT NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE "BidOpportunity"
    ADD COLUMN "fitLabel" "BidFitLabel" NOT NULL DEFAULT 'UNKNOWN';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "importHash" TEXT;

DO $$ BEGIN
  ALTER TABLE "BidOpportunity"
    ADD CONSTRAINT "BidOpportunity_importHash_key" UNIQUE ("importHash");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidOpportunity_fitLabel_idx" ON "BidOpportunity"("fitLabel");
CREATE INDEX IF NOT EXISTS "BidOpportunity_fitScore_idx" ON "BidOpportunity"("fitScore");
CREATE INDEX IF NOT EXISTS "BidOpportunity_importHash_idx" ON "BidOpportunity"("importHash");

ALTER TABLE "GebizImportedItem"
  ADD COLUMN IF NOT EXISTS "importHash" TEXT;

DO $$ BEGIN
  ALTER TABLE "GebizImportedItem"
    ADD CONSTRAINT "GebizImportedItem_feedSourceId_importHash_key" UNIQUE ("feedSourceId", "importHash");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "GebizImportedItem_importHash_idx" ON "GebizImportedItem"("importHash");

