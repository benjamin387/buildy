-- Design workflow AI automation: persist design suggestions and option-set metadata (incremental + safe).

ALTER TABLE "DesignArea"
ADD COLUMN IF NOT EXISTS "aiLayoutSuggestion" TEXT;

ALTER TABLE "DesignArea"
ADD COLUMN IF NOT EXISTS "aiMaterialSuggestion" TEXT;

ALTER TABLE "DesignArea"
ADD COLUMN IF NOT EXISTS "aiFurnitureSuggestion" TEXT;

ALTER TABLE "DesignArea"
ADD COLUMN IF NOT EXISTS "aiLightingSuggestion" TEXT;

ALTER TABLE "DesignArea"
ADD COLUMN IF NOT EXISTS "aiSuggestionGeneratedAt" TIMESTAMP(3);

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "optionSetId" TEXT;

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "optionLabel" TEXT;

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "isSelected" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "selectedAt" TIMESTAMP(3);

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "isRejected" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "VisualRender"
ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "VisualRender_optionSetId_idx" ON "VisualRender"("optionSetId");
CREATE INDEX IF NOT EXISTS "VisualRender_designAreaId_optionSetId_idx" ON "VisualRender"("designAreaId", "optionSetId");
CREATE INDEX IF NOT EXISTS "VisualRender_designAreaId_isSelected_idx" ON "VisualRender"("designAreaId", "isSelected");

