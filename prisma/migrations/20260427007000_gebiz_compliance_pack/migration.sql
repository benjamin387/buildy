-- GeBIZ Tender Compliance Pack + Document Generator (Bidding)
-- Additive changes only; no destructive operations.

DO $$ BEGIN
  CREATE TYPE "ComplianceDocumentCategory" AS ENUM (
    'COMPANY',
    'BCA_REGISTRATION',
    'BIZSAFE',
    'INSURANCE',
    'FINANCIAL_STATEMENT',
    'TRACK_RECORD',
    'KEY_PERSONNEL_CV',
    'EQUIPMENT_LIST',
    'SAFETY_RECORD',
    'DECLARATION',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ComplianceDocumentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenderRequirementStatus" AS ENUM ('PENDING', 'PROVIDED', 'WAIVED', 'NOT_APPLICABLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenderRequirementSourceType" AS ENUM ('COMPLIANCE_DOCUMENT', 'GENERATED_DOCUMENT', 'BID_DOCUMENT', 'MANUAL_URL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenderGeneratedDocumentType" AS ENUM (
    'COMPANY_PROFILE',
    'METHOD_STATEMENT',
    'ORGANISATION_CHART',
    'SAFETY_PLAN',
    'MANPOWER_PLAN',
    'WORK_SCHEDULE',
    'PROJECT_EXPERIENCE',
    'DECLARATIONS_CHECKLIST',
    'SUBMISSION_COVER_LETTER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenderGeneratedDocumentStatus" AS ENUM ('DRAFT', 'GENERATED', 'APPROVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenderSubmissionPackStatus" AS ENUM ('DRAFT', 'APPROVAL_REQUIRED', 'APPROVED', 'RELEASED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenderPackItemSourceType" AS ENUM ('COMPLIANCE_DOCUMENT', 'GENERATED_DOCUMENT', 'BID_DOCUMENT', 'MANUAL_URL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenderDocumentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CompanyComplianceProfile" (
  "id" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "legalName" TEXT,
  "uen" TEXT,
  "gstRegistered" BOOLEAN NOT NULL DEFAULT TRUE,
  "gstNumber" TEXT,
  "bcaRegistration" TEXT,
  "bcaExpiryDate" TIMESTAMPTZ,
  "bizsafeStatus" TEXT,
  "bizsafeExpiryDate" TIMESTAMPTZ,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CompanyComplianceProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanyComplianceProfile_companyName_idx" ON "CompanyComplianceProfile"("companyName");
CREATE INDEX IF NOT EXISTS "CompanyComplianceProfile_uen_idx" ON "CompanyComplianceProfile"("uen");

CREATE TABLE IF NOT EXISTS "ComplianceDocument" (
  "id" TEXT NOT NULL,
  "profileId" TEXT,
  "title" TEXT NOT NULL,
  "category" "ComplianceDocumentCategory" NOT NULL DEFAULT 'OTHER',
  "description" TEXT,
  "fileUrl" TEXT,
  "issueDate" TIMESTAMPTZ,
  "expiryDate" TIMESTAMPTZ,
  "status" "ComplianceDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  "tagsJson" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ComplianceDocument"
    ADD CONSTRAINT "ComplianceDocument_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "CompanyComplianceProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ComplianceDocument_profileId_idx" ON "ComplianceDocument"("profileId");
CREATE INDEX IF NOT EXISTS "ComplianceDocument_category_idx" ON "ComplianceDocument"("category");
CREATE INDEX IF NOT EXISTS "ComplianceDocument_status_idx" ON "ComplianceDocument"("status");
CREATE INDEX IF NOT EXISTS "ComplianceDocument_expiryDate_idx" ON "ComplianceDocument"("expiryDate");
CREATE INDEX IF NOT EXISTS "ComplianceDocument_createdAt_idx" ON "ComplianceDocument"("createdAt");

CREATE TABLE IF NOT EXISTS "TenderDocumentRequirement" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "requirementKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "isMandatory" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" "TenderRequirementStatus" NOT NULL DEFAULT 'PENDING',
  "dueDate" TIMESTAMPTZ,
  "notes" TEXT,
  "satisfiedByType" "TenderRequirementSourceType",
  "complianceDocumentId" TEXT,
  "generatedDocumentId" TEXT,
  "bidDocumentId" TEXT,
  "satisfiedByUrl" TEXT,
  "satisfiedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TenderDocumentRequirement_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "TenderDocumentRequirement"
    ADD CONSTRAINT "TenderDocumentRequirement_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenderDocumentRequirement"
    ADD CONSTRAINT "TenderDocumentRequirement_opportunityId_requirementKey_key"
    UNIQUE ("opportunityId", "requirementKey");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenderDocumentRequirement"
    ADD CONSTRAINT "TenderDocumentRequirement_complianceDocumentId_fkey"
    FOREIGN KEY ("complianceDocumentId") REFERENCES "ComplianceDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- generatedDocumentId FK is added after TenderGeneratedDocument is created below.

CREATE INDEX IF NOT EXISTS "TenderDocumentRequirement_opportunityId_idx" ON "TenderDocumentRequirement"("opportunityId");
CREATE INDEX IF NOT EXISTS "TenderDocumentRequirement_status_idx" ON "TenderDocumentRequirement"("status");
CREATE INDEX IF NOT EXISTS "TenderDocumentRequirement_dueDate_idx" ON "TenderDocumentRequirement"("dueDate");
CREATE INDEX IF NOT EXISTS "TenderDocumentRequirement_isMandatory_idx" ON "TenderDocumentRequirement"("isMandatory");
CREATE INDEX IF NOT EXISTS "TenderDocumentRequirement_complianceDocumentId_idx" ON "TenderDocumentRequirement"("complianceDocumentId");
CREATE INDEX IF NOT EXISTS "TenderDocumentRequirement_generatedDocumentId_idx" ON "TenderDocumentRequirement"("generatedDocumentId");
CREATE INDEX IF NOT EXISTS "TenderDocumentRequirement_createdAt_idx" ON "TenderDocumentRequirement"("createdAt");

CREATE TABLE IF NOT EXISTS "TenderGeneratedDocument" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "docType" "TenderGeneratedDocumentType" NOT NULL,
  "versionNo" INT NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "contentHtml" TEXT NOT NULL,
  "status" "TenderGeneratedDocumentStatus" NOT NULL DEFAULT 'GENERATED',
  "fileUrl" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TenderGeneratedDocument_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "TenderGeneratedDocument"
    ADD CONSTRAINT "TenderGeneratedDocument_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenderGeneratedDocument"
    ADD CONSTRAINT "TenderGeneratedDocument_opportunityId_docType_versionNo_key"
    UNIQUE ("opportunityId", "docType", "versionNo");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TenderGeneratedDocument_opportunityId_idx" ON "TenderGeneratedDocument"("opportunityId");
CREATE INDEX IF NOT EXISTS "TenderGeneratedDocument_docType_idx" ON "TenderGeneratedDocument"("docType");
CREATE INDEX IF NOT EXISTS "TenderGeneratedDocument_status_idx" ON "TenderGeneratedDocument"("status");
CREATE INDEX IF NOT EXISTS "TenderGeneratedDocument_createdAt_idx" ON "TenderGeneratedDocument"("createdAt");

DO $$ BEGIN
  ALTER TABLE "TenderDocumentRequirement"
    ADD CONSTRAINT "TenderDocumentRequirement_generatedDocumentId_fkey"
    FOREIGN KEY ("generatedDocumentId") REFERENCES "TenderGeneratedDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TenderSubmissionPack" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "versionNo" INT NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "status" "TenderSubmissionPackStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedAt" TIMESTAMPTZ,
  "releasedAt" TIMESTAMPTZ,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TenderSubmissionPack_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "TenderSubmissionPack"
    ADD CONSTRAINT "TenderSubmissionPack_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "BidOpportunity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenderSubmissionPack"
    ADD CONSTRAINT "TenderSubmissionPack_opportunityId_versionNo_key"
    UNIQUE ("opportunityId", "versionNo");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TenderSubmissionPack_opportunityId_idx" ON "TenderSubmissionPack"("opportunityId");
CREATE INDEX IF NOT EXISTS "TenderSubmissionPack_status_idx" ON "TenderSubmissionPack"("status");
CREATE INDEX IF NOT EXISTS "TenderSubmissionPack_createdAt_idx" ON "TenderSubmissionPack"("createdAt");

CREATE TABLE IF NOT EXISTS "TenderSubmissionPackItem" (
  "id" TEXT NOT NULL,
  "packId" TEXT NOT NULL,
  "sourceType" "TenderPackItemSourceType" NOT NULL,
  "complianceDocumentId" TEXT,
  "generatedDocumentId" TEXT,
  "bidDocumentId" TEXT,
  "manualUrl" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TenderSubmissionPackItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "TenderSubmissionPackItem"
    ADD CONSTRAINT "TenderSubmissionPackItem_packId_fkey"
    FOREIGN KEY ("packId") REFERENCES "TenderSubmissionPack"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenderSubmissionPackItem"
    ADD CONSTRAINT "TenderSubmissionPackItem_complianceDocumentId_fkey"
    FOREIGN KEY ("complianceDocumentId") REFERENCES "ComplianceDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenderSubmissionPackItem"
    ADD CONSTRAINT "TenderSubmissionPackItem_generatedDocumentId_fkey"
    FOREIGN KEY ("generatedDocumentId") REFERENCES "TenderGeneratedDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TenderSubmissionPackItem_packId_idx" ON "TenderSubmissionPackItem"("packId");
CREATE INDEX IF NOT EXISTS "TenderSubmissionPackItem_sourceType_idx" ON "TenderSubmissionPackItem"("sourceType");
CREATE INDEX IF NOT EXISTS "TenderSubmissionPackItem_sortOrder_idx" ON "TenderSubmissionPackItem"("sortOrder");
CREATE INDEX IF NOT EXISTS "TenderSubmissionPackItem_complianceDocumentId_idx" ON "TenderSubmissionPackItem"("complianceDocumentId");
CREATE INDEX IF NOT EXISTS "TenderSubmissionPackItem_generatedDocumentId_idx" ON "TenderSubmissionPackItem"("generatedDocumentId");

CREATE TABLE IF NOT EXISTS "TenderDocumentApproval" (
  "id" TEXT NOT NULL,
  "packId" TEXT NOT NULL,
  "approverName" TEXT NOT NULL,
  "approverEmail" TEXT,
  "status" "TenderDocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TenderDocumentApproval_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "TenderDocumentApproval"
    ADD CONSTRAINT "TenderDocumentApproval_packId_fkey"
    FOREIGN KEY ("packId") REFERENCES "TenderSubmissionPack"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TenderDocumentApproval_packId_idx" ON "TenderDocumentApproval"("packId");
CREATE INDEX IF NOT EXISTS "TenderDocumentApproval_status_idx" ON "TenderDocumentApproval"("status");
CREATE INDEX IF NOT EXISTS "TenderDocumentApproval_createdAt_idx" ON "TenderDocumentApproval"("createdAt");

