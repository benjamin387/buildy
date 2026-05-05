-- Project Cost Control + Real-Time P&L Engine
ALTER TABLE "VariationOrder" ADD COLUMN "clientApprovedAt" TIMESTAMP(3);

CREATE TABLE "ProjectCostLedger" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "costType" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "incurredDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectCostLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectProfitSnapshot" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contractValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "approvedVariationValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "committedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "actualCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "projectedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "grossProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "grossMargin" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "amountInvoiced" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "outstandingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "riskLevel" TEXT NOT NULL,
  "aiRiskSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectProfitSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectCostLedger_projectId_idx" ON "ProjectCostLedger"("projectId");
CREATE INDEX "ProjectCostLedger_sourceType_sourceId_idx" ON "ProjectCostLedger"("sourceType", "sourceId");
CREATE INDEX "ProjectCostLedger_category_idx" ON "ProjectCostLedger"("category");
CREATE INDEX "ProjectCostLedger_costType_idx" ON "ProjectCostLedger"("costType");
CREATE INDEX "ProjectCostLedger_status_idx" ON "ProjectCostLedger"("status");
CREATE INDEX "ProjectCostLedger_incurredDate_idx" ON "ProjectCostLedger"("incurredDate");

CREATE INDEX "ProjectProfitSnapshot_projectId_idx" ON "ProjectProfitSnapshot"("projectId");
CREATE INDEX "ProjectProfitSnapshot_riskLevel_idx" ON "ProjectProfitSnapshot"("riskLevel");
CREATE INDEX "ProjectProfitSnapshot_createdAt_idx" ON "ProjectProfitSnapshot"("createdAt");

ALTER TABLE "ProjectCostLedger"
  ADD CONSTRAINT "ProjectCostLedger_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectProfitSnapshot"
  ADD CONSTRAINT "ProjectProfitSnapshot_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
