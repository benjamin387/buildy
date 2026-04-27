-- CreateEnum
CREATE TYPE "VariationOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActualCostCategory" AS ENUM ('MATERIAL', 'LABOR', 'SUBCONTRACT', 'PERMIT', 'LOGISTICS', 'OTHER');

-- CreateTable
CREATE TABLE "VariationOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "status" "VariationOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationOrderLineItem" (
    "id" TEXT NOT NULL,
    "variationOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'lot',
    "quantity" DECIMAL(14,2) NOT NULL DEFAULT 1,
    "unitRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationOrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActualCostEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT,
    "category" "ActualCostCategory" NOT NULL DEFAULT 'OTHER',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActualCostEntry_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "VariationOrder_referenceNumber_key" ON "VariationOrder"("referenceNumber");
CREATE INDEX "VariationOrder_projectId_idx" ON "VariationOrder"("projectId");
CREATE INDEX "VariationOrder_status_idx" ON "VariationOrder"("status");
CREATE INDEX "VariationOrder_createdAt_idx" ON "VariationOrder"("createdAt");

CREATE INDEX "VariationOrderLineItem_variationOrderId_idx" ON "VariationOrderLineItem"("variationOrderId");
CREATE INDEX "VariationOrderLineItem_sortOrder_idx" ON "VariationOrderLineItem"("sortOrder");

CREATE INDEX "ActualCostEntry_projectId_idx" ON "ActualCostEntry"("projectId");
CREATE INDEX "ActualCostEntry_vendorId_idx" ON "ActualCostEntry"("vendorId");
CREATE INDEX "ActualCostEntry_category_idx" ON "ActualCostEntry"("category");
CREATE INDEX "ActualCostEntry_occurredAt_idx" ON "ActualCostEntry"("occurredAt");

-- Foreign Keys
ALTER TABLE "VariationOrder" ADD CONSTRAINT "VariationOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariationOrderLineItem" ADD CONSTRAINT "VariationOrderLineItem_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "VariationOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActualCostEntry" ADD CONSTRAINT "ActualCostEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActualCostEntry" ADD CONSTRAINT "ActualCostEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

