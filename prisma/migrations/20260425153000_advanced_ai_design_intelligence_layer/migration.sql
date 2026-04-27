-- Advanced AI Design Intelligence Layer (incremental + safe).

-- Enums for upsell.
DO $$ BEGIN
  CREATE TYPE "UpsellStatus" AS ENUM ('SUGGESTED', 'PRESENTED', 'ACCEPTED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UpsellPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Generated layout plans per design area.
CREATE TABLE IF NOT EXISTS "GeneratedLayoutPlan" (
  "id" TEXT NOT NULL,
  "designAreaId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "roomWidth" DECIMAL(10,2),
  "roomLength" DECIMAL(10,2),
  "doorPosition" TEXT,
  "windowPosition" TEXT,
  "layoutSummary" TEXT NOT NULL,
  "furniturePlacementPlan" TEXT NOT NULL,
  "circulationNotes" TEXT NOT NULL,
  "constraints" TEXT NOT NULL,
  "promptFor3DVisual" TEXT NOT NULL,
  "isSelected" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeneratedLayoutPlan_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "GeneratedLayoutPlan"
  ADD CONSTRAINT "GeneratedLayoutPlan_designAreaId_fkey"
  FOREIGN KEY ("designAreaId") REFERENCES "DesignArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "GeneratedLayoutPlan_designAreaId_idx" ON "GeneratedLayoutPlan"("designAreaId");
CREATE INDEX IF NOT EXISTS "GeneratedLayoutPlan_isSelected_idx" ON "GeneratedLayoutPlan"("isSelected");
CREATE INDEX IF NOT EXISTS "GeneratedLayoutPlan_createdAt_idx" ON "GeneratedLayoutPlan"("createdAt");

-- Budget optimization scenarios per design brief.
CREATE TABLE IF NOT EXISTS "BudgetOptimizationScenario" (
  "id" TEXT NOT NULL,
  "designBriefId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "targetBudget" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currentEstimatedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "revisedEstimatedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "savingsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "recommendationSummary" TEXT NOT NULL,
  "scenarioJson" JSONB NOT NULL,
  "isSelected" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BudgetOptimizationScenario_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BudgetOptimizationScenario"
  ADD CONSTRAINT "BudgetOptimizationScenario_designBriefId_fkey"
  FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BudgetOptimizationScenario"
  ADD CONSTRAINT "BudgetOptimizationScenario_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BudgetOptimizationScenario_designBriefId_idx" ON "BudgetOptimizationScenario"("designBriefId");
CREATE INDEX IF NOT EXISTS "BudgetOptimizationScenario_projectId_idx" ON "BudgetOptimizationScenario"("projectId");
CREATE INDEX IF NOT EXISTS "BudgetOptimizationScenario_isSelected_idx" ON "BudgetOptimizationScenario"("isSelected");
CREATE INDEX IF NOT EXISTS "BudgetOptimizationScenario_createdAt_idx" ON "BudgetOptimizationScenario"("createdAt");

-- Upsell recommendations (design brief and/or project).
CREATE TABLE IF NOT EXISTS "UpsellRecommendation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "designBriefId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "estimatedRevenueIncrease" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "estimatedCostIncrease" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "estimatedProfitIncrease" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "priority" "UpsellPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "UpsellStatus" NOT NULL DEFAULT 'SUGGESTED',
  "pitchText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UpsellRecommendation_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "UpsellRecommendation"
  ADD CONSTRAINT "UpsellRecommendation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UpsellRecommendation"
  ADD CONSTRAINT "UpsellRecommendation_designBriefId_fkey"
  FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "UpsellRecommendation_projectId_idx" ON "UpsellRecommendation"("projectId");
CREATE INDEX IF NOT EXISTS "UpsellRecommendation_designBriefId_idx" ON "UpsellRecommendation"("designBriefId");
CREATE INDEX IF NOT EXISTS "UpsellRecommendation_status_idx" ON "UpsellRecommendation"("status");
CREATE INDEX IF NOT EXISTS "UpsellRecommendation_priority_idx" ON "UpsellRecommendation"("priority");
CREATE INDEX IF NOT EXISTS "UpsellRecommendation_createdAt_idx" ON "UpsellRecommendation"("createdAt");

