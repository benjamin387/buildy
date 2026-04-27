-- Quotation financial hardening:
-- - Add Quotation.estimatedCost (sum of line totalCost)
-- - Add Quotation.isLatest with partial unique index (one latest per project)
-- Safe incremental defaults + backfill.

ALTER TABLE "Quotation"
  ADD COLUMN IF NOT EXISTS "estimatedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isLatest" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "Quotation_projectId_isLatest_idx" ON "Quotation"("projectId", "isLatest");

-- Backfill: mark one latest quotation per project (prefer highest version, then newest createdAt).
WITH latest AS (
  SELECT DISTINCT ON ("projectId") "id"
  FROM "Quotation"
  ORDER BY "projectId", "version" DESC, "createdAt" DESC
)
UPDATE "Quotation" q
SET "isLatest" = TRUE
FROM latest
WHERE q."id" = latest."id";

-- Enforce: only one latest quotation per project.
-- Note: partial unique index keeps history versions intact.
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_one_latest_per_project"
  ON "Quotation"("projectId")
  WHERE "isLatest" = TRUE;

