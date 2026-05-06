-- Proposal client approval + e-sign flow.
-- Adds explicit proposal status tracking, client decision logs, and signature capture.

DO $$ BEGIN
  CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Proposal"
  ADD COLUMN IF NOT EXISTS "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "viewedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Proposal_status_idx" ON "Proposal"("status");
CREATE INDEX IF NOT EXISTS "Proposal_viewedAt_idx" ON "Proposal"("viewedAt");

CREATE TABLE IF NOT EXISTS "ProposalApproval" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "clientEmail" TEXT NOT NULL,
  "status" "ProposalStatus" NOT NULL,
  "comment" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProposalApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProposalApproval_proposalId_idx" ON "ProposalApproval"("proposalId");
CREATE INDEX IF NOT EXISTS "ProposalApproval_status_idx" ON "ProposalApproval"("status");
CREATE INDEX IF NOT EXISTS "ProposalApproval_approvedAt_idx" ON "ProposalApproval"("approvedAt");
CREATE INDEX IF NOT EXISTS "ProposalApproval_rejectedAt_idx" ON "ProposalApproval"("rejectedAt");
CREATE INDEX IF NOT EXISTS "ProposalApproval_createdAt_idx" ON "ProposalApproval"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ProposalApproval"
    ADD CONSTRAINT "ProposalApproval_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProposalSignature" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "signerName" TEXT NOT NULL,
  "signerEmail" TEXT NOT NULL,
  "signatureDataUrl" TEXT NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProposalSignature_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProposalSignature_proposalId_idx" ON "ProposalSignature"("proposalId");
CREATE INDEX IF NOT EXISTS "ProposalSignature_signerEmail_idx" ON "ProposalSignature"("signerEmail");
CREATE INDEX IF NOT EXISTS "ProposalSignature_signedAt_idx" ON "ProposalSignature"("signedAt");
CREATE INDEX IF NOT EXISTS "ProposalSignature_createdAt_idx" ON "ProposalSignature"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ProposalSignature"
    ADD CONSTRAINT "ProposalSignature_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
