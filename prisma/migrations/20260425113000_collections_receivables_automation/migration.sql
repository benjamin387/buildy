-- Collections: automated receivables control metadata on actions (incremental + safe).

ALTER TABLE "CollectionAction"
ADD COLUMN IF NOT EXISTS "stageDays" INTEGER;

ALTER TABLE "CollectionAction"
ADD COLUMN IF NOT EXISTS "templateCode" TEXT;

DO $$ BEGIN
  ALTER TABLE "CollectionAction"
  ADD CONSTRAINT "CollectionAction_caseId_stageDays_channel_key"
  UNIQUE ("caseId", "stageDays", "channel");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "CollectionAction_caseId_stageDays_idx"
  ON "CollectionAction"("caseId", "stageDays");

CREATE INDEX IF NOT EXISTS "CollectionAction_templateCode_idx"
  ON "CollectionAction"("templateCode");

