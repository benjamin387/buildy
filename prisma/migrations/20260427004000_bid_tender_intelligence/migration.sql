-- Tender Intelligence Engine Enhancements
-- - Compliance checklist per bid
-- - Supplier RFQ scope label
-- - Submission / award timestamps

-- 1) BidOpportunity timestamps (safe additive)
ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ;

ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "awardedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "BidOpportunity_submittedAt_idx" ON "BidOpportunity"("submittedAt");
CREATE INDEX IF NOT EXISTS "BidOpportunity_awardedAt_idx" ON "BidOpportunity"("awardedAt");

-- 2) BidSupplierQuote scope label (RFQ comparison)
ALTER TABLE "BidSupplierQuote"
  ADD COLUMN IF NOT EXISTS "scopeLabel" TEXT;

CREATE INDEX IF NOT EXISTS "BidSupplierQuote_scopeLabel_idx" ON "BidSupplierQuote"("scopeLabel");

-- 3) Compliance checklist items
CREATE TABLE IF NOT EXISTS "BidComplianceChecklistItem" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "status" "BidChecklistStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMPTZ,
  "notes" TEXT,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidComplianceChecklistItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidComplianceChecklistItem"
    ADD CONSTRAINT "BidComplianceChecklistItem_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidComplianceChecklistItem"
    ADD CONSTRAINT "BidComplianceChecklistItem_opportunityId_itemKey_key"
    UNIQUE ("opportunityId", "itemKey");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidComplianceChecklistItem_opportunityId_idx" ON "BidComplianceChecklistItem"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidComplianceChecklistItem_status_idx" ON "BidComplianceChecklistItem"("status");
CREATE INDEX IF NOT EXISTS "BidComplianceChecklistItem_sortOrder_idx" ON "BidComplianceChecklistItem"("sortOrder");
CREATE INDEX IF NOT EXISTS "BidComplianceChecklistItem_createdAt_idx" ON "BidComplianceChecklistItem"("createdAt");

