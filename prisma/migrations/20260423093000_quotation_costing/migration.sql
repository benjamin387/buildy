-- CreateTable
CREATE TABLE "QuotationLineItemCost" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationLineItemCost_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "QuotationLineItemCost_lineItemId_key" ON "QuotationLineItemCost"("lineItemId");
CREATE INDEX "QuotationLineItemCost_lineItemId_idx" ON "QuotationLineItemCost"("lineItemId");

-- Foreign Keys
ALTER TABLE "QuotationLineItemCost" ADD CONSTRAINT "QuotationLineItemCost_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "QuotationLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

