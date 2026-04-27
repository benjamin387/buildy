-- Supplier RFQ + Auto Cost Builder (Bidding)
-- Additive changes only; no destructive operations.

DO $$ BEGIN
  CREATE TYPE "BidRfqStatus" AS ENUM ('DRAFT', 'SENT', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidRfqInviteStatus" AS ENUM ('DRAFT', 'SENT', 'OPENED', 'REPLIED', 'OVERDUE', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidRfqQuoteStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'WITHDRAWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidTradePackageKey" AS ENUM (
    'DEMOLITION',
    'CARPENTRY',
    'ELECTRICAL',
    'PLUMBING',
    'PAINTING',
    'FLOORING',
    'CEILING',
    'ALUMINIUM',
    'GLASS',
    'ACMV',
    'FIRE_SAFETY',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidCostVersionStatus" AS ENUM ('DRAFT', 'GENERATED', 'APPROVAL_REQUIRED', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BidCostApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- BidOpportunity cost lock fields
ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "approvedCostVersionId" TEXT;

ALTER TABLE "BidOpportunity"
  ADD COLUMN IF NOT EXISTS "costingLockedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "BidOpportunity_approvedCostVersionId_idx" ON "BidOpportunity"("approvedCostVersionId");
CREATE INDEX IF NOT EXISTS "BidOpportunity_costingLockedAt_idx" ON "BidOpportunity"("costingLockedAt");

-- RFQ tables
CREATE TABLE IF NOT EXISTS "BidRfq" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "BidRfqStatus" NOT NULL DEFAULT 'DRAFT',
  "replyDeadline" TIMESTAMPTZ,
  "briefingNotes" TEXT,
  "scopeSummary" TEXT,
  "tenderDocumentsJson" JSONB,
  "boqLinesJson" JSONB,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "sentAt" TIMESTAMPTZ,
  "closedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidRfq_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidRfq"
    ADD CONSTRAINT "BidRfq_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidRfq_opportunityId_idx" ON "BidRfq"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidRfq_status_idx" ON "BidRfq"("status");
CREATE INDEX IF NOT EXISTS "BidRfq_replyDeadline_idx" ON "BidRfq"("replyDeadline");
CREATE INDEX IF NOT EXISTS "BidRfq_createdAt_idx" ON "BidRfq"("createdAt");

CREATE TABLE IF NOT EXISTS "BidRfqTradePackage" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "tradeKey" "BidTradePackageKey" NOT NULL,
  "title" TEXT NOT NULL,
  "scopeSummary" TEXT,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "preferredQuoteId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidRfqTradePackage_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidRfqTradePackage"
    ADD CONSTRAINT "BidRfqTradePackage_rfqId_fkey"
    FOREIGN KEY ("rfqId") REFERENCES "BidRfq"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidRfqTradePackage"
    ADD CONSTRAINT "BidRfqTradePackage_rfqId_tradeKey_key"
    UNIQUE ("rfqId", "tradeKey");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidRfqTradePackage_rfqId_idx" ON "BidRfqTradePackage"("rfqId");
CREATE INDEX IF NOT EXISTS "BidRfqTradePackage_tradeKey_idx" ON "BidRfqTradePackage"("tradeKey");
CREATE INDEX IF NOT EXISTS "BidRfqTradePackage_sortOrder_idx" ON "BidRfqTradePackage"("sortOrder");

CREATE TABLE IF NOT EXISTS "BidRfqSupplierInvite" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "tradePackageId" TEXT,
  "supplierId" TEXT,
  "supplierNameSnapshot" TEXT NOT NULL,
  "recipientName" TEXT,
  "recipientEmail" TEXT,
  "recipientPhone" TEXT,
  "token" TEXT NOT NULL,
  "status" "BidRfqInviteStatus" NOT NULL DEFAULT 'DRAFT',
  "sentAt" TIMESTAMPTZ,
  "openedAt" TIMESTAMPTZ,
  "repliedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidRfqSupplierInvite_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidRfqSupplierInvite"
    ADD CONSTRAINT "BidRfqSupplierInvite_token_key" UNIQUE ("token");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidRfqSupplierInvite"
    ADD CONSTRAINT "BidRfqSupplierInvite_rfqId_fkey"
    FOREIGN KEY ("rfqId") REFERENCES "BidRfq"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidRfqSupplierInvite"
    ADD CONSTRAINT "BidRfqSupplierInvite_tradePackageId_fkey"
    FOREIGN KEY ("tradePackageId") REFERENCES "BidRfqTradePackage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidRfqSupplierInvite"
    ADD CONSTRAINT "BidRfqSupplierInvite_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidRfqSupplierInvite_rfqId_idx" ON "BidRfqSupplierInvite"("rfqId");
CREATE INDEX IF NOT EXISTS "BidRfqSupplierInvite_tradePackageId_idx" ON "BidRfqSupplierInvite"("tradePackageId");
CREATE INDEX IF NOT EXISTS "BidRfqSupplierInvite_supplierId_idx" ON "BidRfqSupplierInvite"("supplierId");
CREATE INDEX IF NOT EXISTS "BidRfqSupplierInvite_status_idx" ON "BidRfqSupplierInvite"("status");
CREATE INDEX IF NOT EXISTS "BidRfqSupplierInvite_sentAt_idx" ON "BidRfqSupplierInvite"("sentAt");
CREATE INDEX IF NOT EXISTS "BidRfqSupplierInvite_repliedAt_idx" ON "BidRfqSupplierInvite"("repliedAt");

CREATE TABLE IF NOT EXISTS "BidRfqQuote" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "tradePackageId" TEXT,
  "inviteId" TEXT,
  "supplierId" TEXT,
  "supplierNameSnapshot" TEXT NOT NULL,
  "status" "BidRfqQuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "leadTimeDays" INT,
  "exclusions" TEXT,
  "remarks" TEXT,
  "quotationFileUrl" TEXT,
  "submittedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidRfqQuote_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidRfqQuote"
    ADD CONSTRAINT "BidRfqQuote_inviteId_key" UNIQUE ("inviteId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidRfqQuote"
    ADD CONSTRAINT "BidRfqQuote_rfqId_fkey"
    FOREIGN KEY ("rfqId") REFERENCES "BidRfq"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidRfqQuote"
    ADD CONSTRAINT "BidRfqQuote_tradePackageId_fkey"
    FOREIGN KEY ("tradePackageId") REFERENCES "BidRfqTradePackage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidRfqQuote"
    ADD CONSTRAINT "BidRfqQuote_inviteId_fkey"
    FOREIGN KEY ("inviteId") REFERENCES "BidRfqSupplierInvite"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidRfqQuote"
    ADD CONSTRAINT "BidRfqQuote_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidRfqQuote_rfqId_idx" ON "BidRfqQuote"("rfqId");
CREATE INDEX IF NOT EXISTS "BidRfqQuote_tradePackageId_idx" ON "BidRfqQuote"("tradePackageId");
CREATE INDEX IF NOT EXISTS "BidRfqQuote_supplierId_idx" ON "BidRfqQuote"("supplierId");
CREATE INDEX IF NOT EXISTS "BidRfqQuote_status_idx" ON "BidRfqQuote"("status");
CREATE INDEX IF NOT EXISTS "BidRfqQuote_submittedAt_idx" ON "BidRfqQuote"("submittedAt");

CREATE TABLE IF NOT EXISTS "BidRfqQuoteLine" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "unit" TEXT,
  "quantity" NUMERIC(14,2) NOT NULL DEFAULT 1,
  "unitRate" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "totalAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidRfqQuoteLine_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidRfqQuoteLine"
    ADD CONSTRAINT "BidRfqQuoteLine_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "BidRfqQuote"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidRfqQuoteLine_quoteId_idx" ON "BidRfqQuoteLine"("quoteId");
CREATE INDEX IF NOT EXISTS "BidRfqQuoteLine_sortOrder_idx" ON "BidRfqQuoteLine"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "BidRfqTradePackage"
    ADD CONSTRAINT "BidRfqTradePackage_preferredQuoteId_fkey"
    FOREIGN KEY ("preferredQuoteId") REFERENCES "BidRfqQuote"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cost versions + approvals
CREATE TABLE IF NOT EXISTS "BidCostVersion" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "versionNo" INT NOT NULL DEFAULT 1,
  "label" TEXT,
  "status" "BidCostVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "strategyMode" "BidStrategyMode" NOT NULL DEFAULT 'BALANCED',
  "pricingPosition" "BidPricingPosition" NOT NULL DEFAULT 'MATCH',
  "subtotalCost" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "subtotalSell" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "preliminariesAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "overheadPercent" NUMERIC(6,4) NOT NULL DEFAULT 0,
  "contingencyPercent" NUMERIC(6,4) NOT NULL DEFAULT 0,
  "totalCost" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "bidPrice" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "marginPercent" NUMERIC(6,4) NOT NULL DEFAULT 0,
  "generatedFromRfqId" TEXT,
  "notes" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidCostVersion_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidCostVersion"
    ADD CONSTRAINT "BidCostVersion_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidCostVersion"
    ADD CONSTRAINT "BidCostVersion_generatedFromRfqId_fkey"
    FOREIGN KEY ("generatedFromRfqId") REFERENCES "BidRfq"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidCostVersion"
    ADD CONSTRAINT "BidCostVersion_opportunityId_versionNo_key"
    UNIQUE ("opportunityId", "versionNo");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidCostVersion_opportunityId_idx" ON "BidCostVersion"("opportunityId");
CREATE INDEX IF NOT EXISTS "BidCostVersion_status_idx" ON "BidCostVersion"("status");
CREATE INDEX IF NOT EXISTS "BidCostVersion_createdAt_idx" ON "BidCostVersion"("createdAt");
CREATE INDEX IF NOT EXISTS "BidCostVersion_approvedAt_idx" ON "BidCostVersion"("approvedAt");

DO $$ BEGIN
  ALTER TABLE "BidOpportunity"
    ADD CONSTRAINT "BidOpportunity_approvedCostVersionId_fkey"
    FOREIGN KEY ("approvedCostVersionId") REFERENCES "BidCostVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BidCostVersionLine" (
  "id" TEXT NOT NULL,
  "costVersionId" TEXT NOT NULL,
  "tradeKey" "BidTradePackageKey" NOT NULL,
  "description" TEXT NOT NULL,
  "costAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "sellAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "sourceQuoteId" TEXT,
  "notes" TEXT,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidCostVersionLine_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidCostVersionLine"
    ADD CONSTRAINT "BidCostVersionLine_costVersionId_fkey"
    FOREIGN KEY ("costVersionId") REFERENCES "BidCostVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BidCostVersionLine"
    ADD CONSTRAINT "BidCostVersionLine_sourceQuoteId_fkey"
    FOREIGN KEY ("sourceQuoteId") REFERENCES "BidRfqQuote"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidCostVersionLine_costVersionId_idx" ON "BidCostVersionLine"("costVersionId");
CREATE INDEX IF NOT EXISTS "BidCostVersionLine_tradeKey_idx" ON "BidCostVersionLine"("tradeKey");
CREATE INDEX IF NOT EXISTS "BidCostVersionLine_sortOrder_idx" ON "BidCostVersionLine"("sortOrder");

CREATE TABLE IF NOT EXISTS "BidCostApproval" (
  "id" TEXT NOT NULL,
  "costVersionId" TEXT NOT NULL,
  "approverName" TEXT NOT NULL,
  "approverEmail" TEXT,
  "status" "BidCostApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "BidCostApproval_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "BidCostApproval"
    ADD CONSTRAINT "BidCostApproval_costVersionId_fkey"
    FOREIGN KEY ("costVersionId") REFERENCES "BidCostVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BidCostApproval_costVersionId_idx" ON "BidCostApproval"("costVersionId");
CREATE INDEX IF NOT EXISTS "BidCostApproval_status_idx" ON "BidCostApproval"("status");
CREATE INDEX IF NOT EXISTS "BidCostApproval_createdAt_idx" ON "BidCostApproval"("createdAt");

