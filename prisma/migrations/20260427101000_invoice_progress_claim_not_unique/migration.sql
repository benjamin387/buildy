-- Allow multiple invoices per progress claim (partial billing / adjustments).
-- Drop the unique constraint/index on Invoice.progressClaimId (keep non-unique index).

DO $$ BEGIN
  ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_progressClaimId_key";
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP INDEX IF EXISTS "Invoice_progressClaimId_key";
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Invoice_progressClaimId_idx" ON "Invoice"("progressClaimId");

