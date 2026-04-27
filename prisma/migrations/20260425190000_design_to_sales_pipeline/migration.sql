-- Design-to-Sales Automation Pipeline (incremental + safe).

-- Extend DesignBriefStatus for sales pipeline gates.
DO $$ BEGIN
  ALTER TYPE "DesignBriefStatus" ADD VALUE 'READY_FOR_QUOTATION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "DesignBriefStatus" ADD VALUE 'SALES_PACKAGE_READY';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Link quotation to design brief (optional, safe).
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "designBriefId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Quotation"
    ADD CONSTRAINT "Quotation_designBriefId_fkey"
    FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Quotation_designBriefId_idx" ON "Quotation"("designBriefId");

