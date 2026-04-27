-- AlterTable
ALTER TABLE "Quotation"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "profitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "marginPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuotationLineItem"
  ADD COLUMN IF NOT EXISTS "sku" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "marginPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

-- Backfill cost-related fields from legacy QuotationLineItemCost if present.
UPDATE "QuotationLineItem" li
SET
  "costPrice" = COALESCE(c."unitCost", 0),
  "totalCost" = COALESCE(c."costAmount", 0),
  "profit" = li."amount" - COALESCE(c."costAmount", 0),
  "marginPercent" = CASE
    WHEN li."amount" > 0
      THEN ROUND(((li."amount" - COALESCE(c."costAmount", 0)) / li."amount") * 100, 4)
    ELSE 0
  END
FROM "QuotationLineItemCost" c
WHERE c."lineItemId" = li."id";

-- Indexes
CREATE INDEX IF NOT EXISTS "Quotation_projectId_version_idx" ON "Quotation"("projectId", "version");

