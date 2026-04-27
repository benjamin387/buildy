-- Safe Lead.source TEXT -> LeadSource enum conversion without dropping the column.
-- This migration is designed to be safe for production and avoids data loss.
--
-- Strategy:
-- 1) Ensure enum exists
-- 2) Preserve existing Lead.source text into marketingSource (if present)
-- 3) Alter column type in-place using a CASE mapping (unknown -> MANUAL)
-- 4) Enforce default + NOT NULL safely

DO $$ BEGIN
  CREATE TYPE "LeadSource" AS ENUM ('MANUAL', 'WHATSAPP', 'TELEGRAM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "marketingSource" TEXT;

-- Preserve legacy values before conversion.
DO $$ BEGIN
  UPDATE "Lead"
  SET "marketingSource" = COALESCE("marketingSource", "source"::text)
  WHERE "marketingSource" IS NULL AND "source" IS NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- Convert in-place if source exists and is not already LeadSource.
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

  -- If column doesn't exist, create it as enum.
  IF _data_type IS NULL THEN
    ALTER TABLE "Lead" ADD COLUMN "source" "LeadSource" NOT NULL DEFAULT 'MANUAL';
    RETURN;
  END IF;

  -- Already converted, nothing to do.
  IF _data_type = 'USER-DEFINED' AND _udt_name = 'LeadSource' THEN
    RETURN;
  END IF;

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

  ALTER TABLE "Lead" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
  UPDATE "Lead" SET "source" = 'MANUAL' WHERE "source" IS NULL;
  ALTER TABLE "Lead" ALTER COLUMN "source" SET NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN datatype_mismatch THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Lead_source_idx" ON "Lead"("source");

