-- AI-enhanced design workflow engine (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "DesignRole" AS ENUM ('DRAFTER', 'THREE_D_VISUALISER', 'FFE_DESIGNER', 'QUANTITY_SURVEYOR', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DesignTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DesignBriefStatus" AS ENUM (
    'DRAFT',
    'DESIGN_IN_PROGRESS',
    'QS_IN_PROGRESS',
    'PRESENTATION_READY',
    'SENT_TO_CLIENT',
    'APPROVED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClientPresentationStatus" AS ENUM ('DRAFT', 'READY', 'SENT', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DesignBrief" (
  "id" TEXT NOT NULL,
  "leadId" TEXT,
  "projectId" TEXT,
  "title" TEXT NOT NULL,
  "clientNeeds" TEXT NOT NULL,
  "designStyle" "DesignStyle",
  "propertyType" "PropertyType" NOT NULL,
  "status" "DesignBriefStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignBrief_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DesignBrief_leadId_idx" ON "DesignBrief"("leadId");
CREATE INDEX IF NOT EXISTS "DesignBrief_projectId_idx" ON "DesignBrief"("projectId");
CREATE INDEX IF NOT EXISTS "DesignBrief_status_idx" ON "DesignBrief"("status");
CREATE INDEX IF NOT EXISTS "DesignBrief_createdAt_idx" ON "DesignBrief"("createdAt");

DO $$ BEGIN
  ALTER TABLE "DesignBrief"
    ADD CONSTRAINT "DesignBrief_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DesignBrief"
    ADD CONSTRAINT "DesignBrief_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DesignTask" (
  "id" TEXT NOT NULL,
  "designBriefId" TEXT NOT NULL,
  "role" "DesignRole" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "DesignTaskStatus" NOT NULL DEFAULT 'TODO',
  "assignedTo" TEXT,
  "dueDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DesignTask_designBriefId_idx" ON "DesignTask"("designBriefId");
CREATE INDEX IF NOT EXISTS "DesignTask_role_idx" ON "DesignTask"("role");
CREATE INDEX IF NOT EXISTS "DesignTask_status_idx" ON "DesignTask"("status");
CREATE INDEX IF NOT EXISTS "DesignTask_dueDate_idx" ON "DesignTask"("dueDate");
CREATE INDEX IF NOT EXISTS "DesignTask_createdAt_idx" ON "DesignTask"("createdAt");

DO $$ BEGIN
  ALTER TABLE "DesignTask"
    ADD CONSTRAINT "DesignTask_designBriefId_fkey"
    FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DesignArea" (
  "id" TEXT NOT NULL,
  "designBriefId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "roomType" "RoomType" NOT NULL,
  "clientRequirement" TEXT,
  "proposedLayoutNotes" TEXT,
  "proposedMaterials" TEXT,
  "proposedTheme" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignArea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DesignArea_designBriefId_idx" ON "DesignArea"("designBriefId");
CREATE INDEX IF NOT EXISTS "DesignArea_roomType_idx" ON "DesignArea"("roomType");
CREATE INDEX IF NOT EXISTS "DesignArea_createdAt_idx" ON "DesignArea"("createdAt");

DO $$ BEGIN
  ALTER TABLE "DesignArea"
    ADD CONSTRAINT "DesignArea_designBriefId_fkey"
    FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LayoutPlan" (
  "id" TEXT NOT NULL,
  "designAreaId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "fileUrl" TEXT,
  "generatedNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LayoutPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LayoutPlan_designAreaId_idx" ON "LayoutPlan"("designAreaId");
CREATE INDEX IF NOT EXISTS "LayoutPlan_createdAt_idx" ON "LayoutPlan"("createdAt");

DO $$ BEGIN
  ALTER TABLE "LayoutPlan"
    ADD CONSTRAINT "LayoutPlan_designAreaId_fkey"
    FOREIGN KEY ("designAreaId") REFERENCES "DesignArea"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VisualRender" (
  "id" TEXT NOT NULL,
  "designAreaId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "theme" TEXT,
  "materialNotes" TEXT,
  "fileUrl" TEXT,
  "generatedPrompt" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisualRender_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VisualRender_designAreaId_idx" ON "VisualRender"("designAreaId");
CREATE INDEX IF NOT EXISTS "VisualRender_createdAt_idx" ON "VisualRender"("createdAt");

DO $$ BEGIN
  ALTER TABLE "VisualRender"
    ADD CONSTRAINT "VisualRender_designAreaId_fkey"
    FOREIGN KEY ("designAreaId") REFERENCES "DesignArea"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FFEProposal" (
  "id" TEXT NOT NULL,
  "designAreaId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "supplierName" TEXT,
  "purchaseUrl" TEXT,
  "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "leadTimeDays" INTEGER,
  "availabilityStatus" TEXT,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FFEProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FFEProposal_designAreaId_idx" ON "FFEProposal"("designAreaId");
CREATE INDEX IF NOT EXISTS "FFEProposal_createdAt_idx" ON "FFEProposal"("createdAt");

DO $$ BEGIN
  ALTER TABLE "FFEProposal"
    ADD CONSTRAINT "FFEProposal_designAreaId_fkey"
    FOREIGN KEY ("designAreaId") REFERENCES "DesignArea"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "QSBoqDraftItem" (
  "id" TEXT NOT NULL,
  "designAreaId" TEXT NOT NULL,
  "quotationItemId" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "recommendedSellingUnitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "estimatedCostUnitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "sellingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "costTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "marginPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "isEditable" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QSBoqDraftItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QSBoqDraftItem_designAreaId_idx" ON "QSBoqDraftItem"("designAreaId");
CREATE INDEX IF NOT EXISTS "QSBoqDraftItem_quotationItemId_idx" ON "QSBoqDraftItem"("quotationItemId");
CREATE INDEX IF NOT EXISTS "QSBoqDraftItem_sortOrder_idx" ON "QSBoqDraftItem"("sortOrder");
CREATE INDEX IF NOT EXISTS "QSBoqDraftItem_createdAt_idx" ON "QSBoqDraftItem"("createdAt");

DO $$ BEGIN
  ALTER TABLE "QSBoqDraftItem"
    ADD CONSTRAINT "QSBoqDraftItem_designAreaId_fkey"
    FOREIGN KEY ("designAreaId") REFERENCES "DesignArea"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "QSBoqDraftItem"
    ADD CONSTRAINT "QSBoqDraftItem_quotationItemId_fkey"
    FOREIGN KEY ("quotationItemId") REFERENCES "QuotationLineItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ClientPresentation" (
  "id" TEXT NOT NULL,
  "designBriefId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "addressedTo" TEXT NOT NULL,
  "presentationDate" TIMESTAMP(3),
  "introductionText" TEXT,
  "teamIntroduction" TEXT,
  "companyPortfolioText" TEXT,
  "whyChooseUsText" TEXT,
  "fileUrl" TEXT,
  "status" "ClientPresentationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientPresentation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientPresentation_designBriefId_key" ON "ClientPresentation"("designBriefId");
CREATE INDEX IF NOT EXISTS "ClientPresentation_status_idx" ON "ClientPresentation"("status");
CREATE INDEX IF NOT EXISTS "ClientPresentation_createdAt_idx" ON "ClientPresentation"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ClientPresentation"
    ADD CONSTRAINT "ClientPresentation_designBriefId_fkey"
    FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

