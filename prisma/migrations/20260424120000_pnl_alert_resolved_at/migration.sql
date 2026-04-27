-- Add resolvedAt column for PnLAlert (bank-grade alert lifecycle).
ALTER TABLE "PnLAlert"
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PnLAlert_resolvedAt_idx" ON "PnLAlert"("resolvedAt");

