-- Extend QuotationPaymentTerm to support progressive payment trigger + due day offsets.
-- Safe and incremental: nullable columns for backfill-free rollout.

ALTER TABLE "QuotationPaymentTerm"
  ADD COLUMN IF NOT EXISTS "triggerType" TEXT,
  ADD COLUMN IF NOT EXISTS "dueDays" INTEGER;

