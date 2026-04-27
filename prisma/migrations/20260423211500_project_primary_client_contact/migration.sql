-- Add nullable Project.primaryClientContactId for normalized ClientContact linkage.
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "primaryClientContactId" TEXT;

CREATE INDEX IF NOT EXISTS "Project_primaryClientContactId_idx"
  ON "Project"("primaryClientContactId");

DO $$ BEGIN
  ALTER TABLE "Project"
    ADD CONSTRAINT "Project_primaryClientContactId_fkey"
    FOREIGN KEY ("primaryClientContactId") REFERENCES "ClientContact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

