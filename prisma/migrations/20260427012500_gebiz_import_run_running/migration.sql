-- Add RUNNING status for GeBIZ import runs (safe additive enum extension).
DO $$ BEGIN
  ALTER TYPE "GebizImportRunStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

