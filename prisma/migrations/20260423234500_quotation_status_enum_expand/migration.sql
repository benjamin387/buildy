-- Expand QuotationStatus enum to match Prisma schema (safe, incremental).
-- Init enum values: DRAFT, CALCULATED, SENT, APPROVED, REJECTED
-- Current app writes: PREPARED (and supports EXPIRED/CANCELLED).

DO $$ BEGIN
  ALTER TYPE "QuotationStatus" ADD VALUE 'PREPARED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "QuotationStatus" ADD VALUE 'EXPIRED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "QuotationStatus" ADD VALUE 'CANCELLED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

