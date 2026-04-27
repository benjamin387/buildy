-- Visual renders: AI generation metadata (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "VisualGenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "promptText" TEXT;

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "generatedImageUrl" TEXT;

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "generationStatus" "VisualGenerationStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

-- Backfill from legacy columns.
UPDATE "VisualRender"
SET "promptText" = COALESCE("promptText", "generatedPrompt")
WHERE "promptText" IS NULL AND "generatedPrompt" IS NOT NULL;

UPDATE "VisualRender"
SET "generatedImageUrl" = COALESCE("generatedImageUrl", "fileUrl")
WHERE "generatedImageUrl" IS NULL AND "fileUrl" IS NOT NULL;

UPDATE "VisualRender"
SET "generationStatus" = 'COMPLETED'
WHERE "generationStatus" = 'PENDING' AND ("generatedImageUrl" IS NOT NULL OR "fileUrl" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "VisualRender_generationStatus_idx" ON "VisualRender"("generationStatus");
CREATE INDEX IF NOT EXISTS "VisualRender_designAreaId_generationStatus_idx" ON "VisualRender"("designAreaId", "generationStatus");

