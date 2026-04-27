-- Invoice Engine v2: GST-ready invoice fields, progressive billing schedules, receipts, credit notes.
-- Safe incremental migration evolving existing tables:
-- - Invoice (adds invoiceType, discountAmount, outstandingAmount, variationOrderId, xeroInvoiceId)
-- - InvoiceLineItem (adds itemId, sku)
-- - PaymentScheduleItem (adds contractId, quotationId, scheduleType, billedAmount, paidAmount, sortOrder)
-- - InvoicePayment (evolves into PaymentReceipt: adds receiptNumber, updatedAt, xeroPaymentId; invoiceId becomes nullable)
-- - New tables: PaymentScheduleInvoice, CreditNote

-- 1) Expand enums (idempotent).
DO $$ BEGIN
  ALTER TYPE "InvoiceStatus" ADD VALUE 'VIEWED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "InvoiceStatus" ADD VALUE 'OVERDUE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "PaymentScheduleStatus" ADD VALUE 'PENDING';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "PaymentScheduleStatus" ADD VALUE 'BILLED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "PaymentScheduleStatus" ADD VALUE 'PARTIALLY_PAID';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "PaymentScheduleStatus" ADD VALUE 'PAID';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) New enums.
DO $$ BEGIN
  CREATE TYPE "InvoiceType" AS ENUM ('DEPOSIT', 'PROGRESS', 'FINAL', 'VARIATION', 'CREDIT_NOTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentScheduleType" AS ENUM ('QUOTATION_PAYMENT_TERM', 'CONTRACT_MILESTONE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'APPLIED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Invoice table upgrades.
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "invoiceType" "InvoiceType" NOT NULL DEFAULT 'PROGRESS',
  ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "outstandingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "variationOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "xeroInvoiceId" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_dueDate_idx" ON "Invoice"("dueDate");
CREATE INDEX IF NOT EXISTS "Invoice_invoiceType_idx" ON "Invoice"("invoiceType");
CREATE INDEX IF NOT EXISTS "Invoice_variationOrderId_idx" ON "Invoice"("variationOrderId");

DO $$ BEGIN
  ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_variationOrderId_fkey"
    FOREIGN KEY ("variationOrderId") REFERENCES "VariationOrder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill outstandingAmount for existing invoices: totalAmount - receipts applied.
UPDATE "Invoice" i
SET "outstandingAmount" = GREATEST(
  COALESCE(i."totalAmount", 0) - COALESCE(p.sum_amount, 0),
  0
)
FROM (
  SELECT "invoiceId", COALESCE(SUM("amount"), 0) AS sum_amount
  FROM "InvoicePayment"
  GROUP BY "invoiceId"
) p
WHERE i."id" = p."invoiceId";

UPDATE "Invoice" i
SET "outstandingAmount" = COALESCE(i."totalAmount", 0)
WHERE NOT EXISTS (
  SELECT 1 FROM "InvoicePayment" p WHERE p."invoiceId" = i."id"
);

-- Migrate legacy ISSUED invoices to SENT for the new canonical workflow (optional but helpful).
UPDATE "Invoice" SET "status" = 'SENT' WHERE "status" = 'ISSUED';

-- 4) Invoice line items: SKU and ItemMaster linkage.
ALTER TABLE "InvoiceLineItem"
  ADD COLUMN IF NOT EXISTS "itemId" TEXT,
  ADD COLUMN IF NOT EXISTS "sku" TEXT;

CREATE INDEX IF NOT EXISTS "InvoiceLineItem_itemId_idx" ON "InvoiceLineItem"("itemId");

DO $$ BEGIN
  ALTER TABLE "InvoiceLineItem"
    ADD CONSTRAINT "InvoiceLineItem_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "ItemMaster"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5) Payment schedule upgrades.
ALTER TABLE "PaymentScheduleItem"
  ADD COLUMN IF NOT EXISTS "contractId" TEXT,
  ADD COLUMN IF NOT EXISTS "quotationId" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduleType" "PaymentScheduleType" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "billedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "PaymentScheduleItem_contractId_idx" ON "PaymentScheduleItem"("contractId");
CREATE INDEX IF NOT EXISTS "PaymentScheduleItem_quotationId_idx" ON "PaymentScheduleItem"("quotationId");
CREATE INDEX IF NOT EXISTS "PaymentScheduleItem_dueDate_idx" ON "PaymentScheduleItem"("dueDate");
CREATE INDEX IF NOT EXISTS "PaymentScheduleItem_sortOrder_idx" ON "PaymentScheduleItem"("sortOrder");
CREATE INDEX IF NOT EXISTS "PaymentScheduleItem_scheduleType_idx" ON "PaymentScheduleItem"("scheduleType");

DO $$ BEGIN
  ALTER TABLE "PaymentScheduleItem"
    ADD CONSTRAINT "PaymentScheduleItem_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentScheduleItem"
    ADD CONSTRAINT "PaymentScheduleItem_quotationId_fkey"
    FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Normalize legacy schedule statuses to new canonical values where possible.
UPDATE "PaymentScheduleItem" SET "status" = 'PENDING' WHERE "status" = 'PLANNED';
UPDATE "PaymentScheduleItem" SET "status" = 'BILLED' WHERE "status" = 'INVOICED';
UPDATE "PaymentScheduleItem" SET "status" = 'PAID' WHERE "status" = 'COLLECTED';

-- 6) PaymentScheduleInvoice allocations (enables multiple invoices per schedule stage).
CREATE TABLE IF NOT EXISTS "PaymentScheduleInvoice" (
  "id" TEXT NOT NULL,
  "paymentScheduleId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "allocatedSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentScheduleInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentScheduleInvoice_paymentScheduleId_invoiceId_key"
  ON "PaymentScheduleInvoice"("paymentScheduleId", "invoiceId");
CREATE INDEX IF NOT EXISTS "PaymentScheduleInvoice_paymentScheduleId_idx" ON "PaymentScheduleInvoice"("paymentScheduleId");
CREATE INDEX IF NOT EXISTS "PaymentScheduleInvoice_invoiceId_idx" ON "PaymentScheduleInvoice"("invoiceId");

DO $$ BEGIN
  ALTER TABLE "PaymentScheduleInvoice"
    ADD CONSTRAINT "PaymentScheduleInvoice_paymentScheduleId_fkey"
    FOREIGN KEY ("paymentScheduleId") REFERENCES "PaymentScheduleItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentScheduleInvoice"
    ADD CONSTRAINT "PaymentScheduleInvoice_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7) Receipts (InvoicePayment) upgrades.
ALTER TABLE "InvoicePayment"
  ADD COLUMN IF NOT EXISTS "receiptNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "xeroPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "InvoicePayment"
  ALTER COLUMN "invoiceId" DROP NOT NULL;

-- Backfill receipt numbers for existing rows.
UPDATE "InvoicePayment"
SET "receiptNumber" = COALESCE(
  "receiptNumber",
  'RC-' || TO_CHAR("receivedAt", 'YYYYMMDD') || '-' || SUBSTRING("id", 1, 6)
)
WHERE "receiptNumber" IS NULL;

ALTER TABLE "InvoicePayment"
  ALTER COLUMN "receiptNumber" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "InvoicePayment_receiptNumber_key" ON "InvoicePayment"("receiptNumber");
CREATE INDEX IF NOT EXISTS "InvoicePayment_updatedAt_idx" ON "InvoicePayment"("updatedAt");

-- Switch invoice receipt FK to SET NULL (so unallocated receipts can exist).
DO $$ BEGIN
  ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_invoiceId_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InvoicePayment"
    ADD CONSTRAINT "InvoicePayment_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8) Credit notes.
CREATE TABLE IF NOT EXISTS "CreditNote" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "creditNoteNumber" TEXT NOT NULL,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
  "xeroCreditNoteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber");
CREATE INDEX IF NOT EXISTS "CreditNote_projectId_idx" ON "CreditNote"("projectId");
CREATE INDEX IF NOT EXISTS "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");
CREATE INDEX IF NOT EXISTS "CreditNote_issueDate_idx" ON "CreditNote"("issueDate");
CREATE INDEX IF NOT EXISTS "CreditNote_status_idx" ON "CreditNote"("status");

DO $$ BEGIN
  ALTER TABLE "CreditNote"
    ADD CONSTRAINT "CreditNote_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreditNote"
    ADD CONSTRAINT "CreditNote_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
