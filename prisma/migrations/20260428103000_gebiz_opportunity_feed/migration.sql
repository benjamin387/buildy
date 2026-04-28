-- GeBIZ opportunity feed persistence

CREATE TABLE IF NOT EXISTS "GebizOpportunity" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "agency" TEXT,
  "category" TEXT,
  "procurementMethod" TEXT,
  "publishedAt" TIMESTAMPTZ,
  "closingAt" TIMESTAMPTZ,
  "detailUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "rawJson" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "GebizOpportunity_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "GebizOpportunity"
    ADD CONSTRAINT "GebizOpportunity_sourceId_key"
    UNIQUE ("sourceId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GebizOpportunity"
    ADD CONSTRAINT "GebizOpportunity_detailUrl_key"
    UNIQUE ("detailUrl");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "GebizOpportunity_publishedAt_idx" ON "GebizOpportunity"("publishedAt");
CREATE INDEX IF NOT EXISTS "GebizOpportunity_closingAt_idx" ON "GebizOpportunity"("closingAt");
CREATE INDEX IF NOT EXISTS "GebizOpportunity_status_idx" ON "GebizOpportunity"("status");
CREATE INDEX IF NOT EXISTS "GebizOpportunity_createdAt_idx" ON "GebizOpportunity"("createdAt");
