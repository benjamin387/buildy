-- Contract Engine v2 + e-sign foundation.
-- This migration evolves the existing "JobContract" table in-place (Prisma model: Contract @@map("JobContract")).
-- Safe incremental approach:
-- - Add new nullable columns (or defaults) and new tables.
-- - Expand enums via ADD VALUE guarded by duplicate_object.
-- - Keep legacy columns and existing routes working.

-- 1) Expand existing ContractStatus enum (keep legacy values).
DO $$ BEGIN
  ALTER TYPE "ContractStatus" ADD VALUE 'SENT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ContractStatus" ADD VALUE 'PARTIALLY_SIGNED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ContractStatus" ADD VALUE 'REJECTED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ContractStatus" ADD VALUE 'EXPIRED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) New enums.
DO $$ BEGIN
  CREATE TYPE "ContractMilestoneStatus" AS ENUM ('PLANNED', 'DUE', 'INVOICED', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureDocumentType" AS ENUM ('CONTRACT', 'QUOTATION', 'SUBCONTRACT', 'PURCHASE_ORDER', 'VARIATION_ORDER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureRequestStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_SIGNED', 'SIGNED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignaturePartyRole" AS ENUM ('CLIENT', 'COMPANY', 'WITNESS', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignaturePartyStatus" AS ENUM ('PENDING', 'VIEWED', 'SIGNED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureEventType" AS ENUM ('CREATED', 'SENT', 'VIEWED', 'SIGNED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Evolve JobContract table to Contract spec.
ALTER TABLE "JobContract"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "clientCompanySnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "clientEmailSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "clientPhoneSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "contractValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retentionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "defectsLiabilityDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "warrantyMonths" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completionDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "termsText" TEXT,
  ADD COLUMN IF NOT EXISTS "scopeSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "paymentTermsSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);

-- Unique constraints: move from contractNumber unique -> (contractNumber, version).
DROP INDEX IF EXISTS "JobContract_contractNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "JobContract_contractNumber_version_key"
  ON "JobContract"("contractNumber", "version");

-- 4) Contract milestones.
CREATE TABLE IF NOT EXISTS "ContractMilestone" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueDate" TIMESTAMP(3),
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "ContractMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractMilestone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContractMilestone_contractId_idx" ON "ContractMilestone"("contractId");
CREATE INDEX IF NOT EXISTS "ContractMilestone_status_idx" ON "ContractMilestone"("status");
CREATE INDEX IF NOT EXISTS "ContractMilestone_dueDate_idx" ON "ContractMilestone"("dueDate");
CREATE INDEX IF NOT EXISTS "ContractMilestone_sortOrder_idx" ON "ContractMilestone"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "ContractMilestone"
    ADD CONSTRAINT "ContractMilestone_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5) Signature tables.
CREATE TABLE IF NOT EXISTS "SignatureRequest" (
  "id" TEXT NOT NULL,
  "documentType" "SignatureDocumentType" NOT NULL,
  "documentId" TEXT NOT NULL,
  "contractId" TEXT,
  "status" "SignatureRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "sentAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SignatureRequest_documentType_documentId_idx" ON "SignatureRequest"("documentType", "documentId");
CREATE INDEX IF NOT EXISTS "SignatureRequest_contractId_idx" ON "SignatureRequest"("contractId");
CREATE INDEX IF NOT EXISTS "SignatureRequest_status_idx" ON "SignatureRequest"("status");
CREATE INDEX IF NOT EXISTS "SignatureRequest_sentAt_idx" ON "SignatureRequest"("sentAt");
CREATE INDEX IF NOT EXISTS "SignatureRequest_expiresAt_idx" ON "SignatureRequest"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "SignatureRequest"
    ADD CONSTRAINT "SignatureRequest_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SignatureParty" (
  "id" TEXT NOT NULL,
  "signatureRequestId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "SignaturePartyRole" NOT NULL DEFAULT 'OTHER',
  "sequenceNo" INTEGER NOT NULL DEFAULT 1,
  "status" "SignaturePartyStatus" NOT NULL DEFAULT 'PENDING',
  "signedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SignatureParty_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SignatureParty_signatureRequestId_idx" ON "SignatureParty"("signatureRequestId");
CREATE INDEX IF NOT EXISTS "SignatureParty_email_idx" ON "SignatureParty"("email");
CREATE INDEX IF NOT EXISTS "SignatureParty_status_idx" ON "SignatureParty"("status");
CREATE INDEX IF NOT EXISTS "SignatureParty_sequenceNo_idx" ON "SignatureParty"("sequenceNo");
CREATE UNIQUE INDEX IF NOT EXISTS "SignatureParty_signatureRequestId_email_key" ON "SignatureParty"("signatureRequestId", "email");

DO $$ BEGIN
  ALTER TABLE "SignatureParty"
    ADD CONSTRAINT "SignatureParty_signatureRequestId_fkey"
    FOREIGN KEY ("signatureRequestId") REFERENCES "SignatureRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SignatureEvent" (
  "id" TEXT NOT NULL,
  "signatureRequestId" TEXT NOT NULL,
  "eventType" "SignatureEventType" NOT NULL,
  "actorName" TEXT,
  "actorEmail" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SignatureEvent_signatureRequestId_idx" ON "SignatureEvent"("signatureRequestId");
CREATE INDEX IF NOT EXISTS "SignatureEvent_eventType_idx" ON "SignatureEvent"("eventType");
CREATE INDEX IF NOT EXISTS "SignatureEvent_eventAt_idx" ON "SignatureEvent"("eventAt");

DO $$ BEGIN
  ALTER TABLE "SignatureEvent"
    ADD CONSTRAINT "SignatureEvent_signatureRequestId_fkey"
    FOREIGN KEY ("signatureRequestId") REFERENCES "SignatureRequest"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

