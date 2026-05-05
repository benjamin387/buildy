-- AI Design Brief Engine
ALTER TABLE "DesignBrief"
  ADD COLUMN "clientName" TEXT,
  ADD COLUMN "clientPhone" TEXT,
  ADD COLUMN "clientEmail" TEXT,
  ADD COLUMN "propertyAddress" TEXT,
  ADD COLUMN "floorArea" TEXT,
  ADD COLUMN "rooms" TEXT,
  ADD COLUMN "budgetMin" DECIMAL(14,2),
  ADD COLUMN "budgetMax" DECIMAL(14,2),
  ADD COLUMN "preferredStyle" TEXT,
  ADD COLUMN "timeline" TEXT,
  ADD COLUMN "requirements" TEXT,
  ADD COLUMN "aiSummary" TEXT,
  ADD COLUMN "aiRecommendedStyle" TEXT,
  ADD COLUMN "aiBudgetRisk" TEXT,
  ADD COLUMN "aiNextAction" TEXT;

CREATE TABLE "DesignConcept" (
  "id" TEXT NOT NULL,
  "designBriefId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "theme" TEXT,
  "conceptSummary" TEXT NOT NULL,
  "livingRoomConcept" TEXT,
  "bedroomConcept" TEXT,
  "kitchenConcept" TEXT,
  "bathroomConcept" TEXT,
  "materialPalette" TEXT,
  "lightingPlan" TEXT,
  "furnitureDirection" TEXT,
  "renovationScope" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DesignConcept_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DesignConcept_designBriefId_idx" ON "DesignConcept"("designBriefId");
CREATE INDEX "DesignConcept_createdAt_idx" ON "DesignConcept"("createdAt");

ALTER TABLE "DesignConcept"
  ADD CONSTRAINT "DesignConcept_designBriefId_fkey"
  FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
