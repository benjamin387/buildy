-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'FINAL', 'SIGNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "JobContract" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "quotationId" TEXT,
    "contractNumber" TEXT NOT NULL,
    "contractDate" TIMESTAMP(3) NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "clientNameSnapshot" TEXT NOT NULL,
    "projectNameSnapshot" TEXT NOT NULL,
    "projectAddress1" TEXT NOT NULL,
    "projectAddress2" TEXT,
    "projectPostalCode" TEXT,
    "contractSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "scopeOfWork" TEXT,
    "paymentTerms" TEXT,
    "warrantyTerms" TEXT,
    "variationPolicy" TEXT,
    "defectsPolicy" TEXT,
    "insurancePolicy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobContract_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "JobContract_contractNumber_key" ON "JobContract"("contractNumber");
CREATE INDEX "JobContract_projectId_idx" ON "JobContract"("projectId");
CREATE INDEX "JobContract_quotationId_idx" ON "JobContract"("quotationId");
CREATE INDEX "JobContract_contractDate_idx" ON "JobContract"("contractDate");
CREATE INDEX "JobContract_status_idx" ON "JobContract"("status");

-- Foreign Keys
ALTER TABLE "JobContract" ADD CONSTRAINT "JobContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobContract" ADD CONSTRAINT "JobContract_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

