-- AI BOQ Generator + Quotation Converter
CREATE TABLE "DesignBOQ" (
  "id" TEXT NOT NULL,
  "designBriefId" TEXT NOT NULL,
  "designConceptId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalSellingPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "grossProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "grossMargin" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "aiRiskNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DesignBOQ_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignBOQItem" (
  "id" TEXT NOT NULL,
  "designBOQId" TEXT NOT NULL,
  "room" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL,
  "costRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sellingRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalSellingPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "margin" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "supplierType" TEXT,
  "riskLevel" TEXT,
  "aiNotes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DesignBOQItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DesignBOQ_designBriefId_idx" ON "DesignBOQ"("designBriefId");
CREATE INDEX "DesignBOQ_designConceptId_idx" ON "DesignBOQ"("designConceptId");
CREATE INDEX "DesignBOQ_createdAt_idx" ON "DesignBOQ"("createdAt");

CREATE INDEX "DesignBOQItem_designBOQId_idx" ON "DesignBOQItem"("designBOQId");
CREATE INDEX "DesignBOQItem_room_idx" ON "DesignBOQItem"("room");
CREATE INDEX "DesignBOQItem_category_idx" ON "DesignBOQItem"("category");
CREATE INDEX "DesignBOQItem_sortOrder_idx" ON "DesignBOQItem"("sortOrder");

ALTER TABLE "DesignBOQ"
  ADD CONSTRAINT "DesignBOQ_designBriefId_fkey"
  FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesignBOQ"
  ADD CONSTRAINT "DesignBOQ_designConceptId_fkey"
  FOREIGN KEY ("designConceptId") REFERENCES "DesignConcept"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesignBOQItem"
  ADD CONSTRAINT "DesignBOQItem_designBOQId_fkey"
  FOREIGN KEY ("designBOQId") REFERENCES "DesignBOQ"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
