-- User Lead Channel Control + Lead submission/assignment (incremental + safe).

-- Enum for channel source.
DO $$ BEGIN
  CREATE TYPE "LeadSource" AS ENUM ('MANUAL', 'WHATSAPP', 'TELEGRAM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- User: channel fields + toggle.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mobileNumber" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappNumber" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canSubmitLeads" BOOLEAN NOT NULL DEFAULT TRUE;

-- Lead: new columns.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "marketingSource" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "submittedByUserId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "propertyType" "PropertyType";
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "propertyAddress" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "estimatedBudget" NUMERIC(14,2);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "preferredStartDate" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "remarks" TEXT;

-- Preserve legacy Lead.source text into marketingSource before converting Lead.source to LeadSource.
DO $$ BEGIN
  UPDATE "Lead"
  SET "marketingSource" = COALESCE("marketingSource", "source"::text)
  WHERE "marketingSource" IS NULL AND "source" IS NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- Convert Lead.source TEXT -> LeadSource enum safely (no drop/recreate).
-- We map known values and default to MANUAL for unknowns.
DO $$ DECLARE
  _data_type TEXT;
  _udt_name TEXT;
BEGIN
  SELECT c.data_type, c.udt_name
  INTO _data_type, _udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'Lead'
    AND c.column_name = 'source'
  LIMIT 1;

  IF _data_type IS NOT NULL AND NOT (_data_type = 'USER-DEFINED' AND _udt_name = 'LeadSource') THEN
    ALTER TABLE "Lead"
      ALTER COLUMN "source" TYPE "LeadSource"
      USING (
        CASE
          WHEN "source" IS NULL THEN 'MANUAL'
          WHEN lower("source"::text) IN ('manual') THEN 'MANUAL'
          WHEN lower("source"::text) IN ('whatsapp', 'wa') THEN 'WHATSAPP'
          WHEN lower("source"::text) IN ('telegram', 'tg') THEN 'TELEGRAM'
          ELSE 'MANUAL'
        END
      )::"LeadSource";
  END IF;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN datatype_mismatch THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- Ensure no NULL values before applying NOT NULL constraint (prevents migration failure).
DO $$ BEGIN
  UPDATE "Lead" SET "source" = 'MANUAL' WHERE "source" IS NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ALTER COLUMN "source" SET NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- FKs to User.
DO $$ BEGIN
  ALTER TABLE "Lead"
    ADD CONSTRAINT "Lead_submittedByUserId_fkey"
    FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Lead"
    ADD CONSTRAINT "Lead_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Indexes.
CREATE INDEX IF NOT EXISTS "Lead_source_idx" ON "Lead"("source");
CREATE INDEX IF NOT EXISTS "Lead_submittedByUserId_idx" ON "Lead"("submittedByUserId");
CREATE INDEX IF NOT EXISTS "Lead_assignedToUserId_idx" ON "Lead"("assignedToUserId");
CREATE INDEX IF NOT EXISTS "Lead_propertyType_idx" ON "Lead"("propertyType");
CREATE INDEX IF NOT EXISTS "Lead_estimatedBudget_idx" ON "Lead"("estimatedBudget");
CREATE INDEX IF NOT EXISTS "Lead_preferredStartDate_idx" ON "Lead"("preferredStartDate");
