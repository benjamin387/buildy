-- Contract signature + approval engine tables

CREATE TABLE "ContractSignature" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "clientPortalAccessId" TEXT NOT NULL,
  "signerName" TEXT NOT NULL,
  "signerEmail" TEXT NOT NULL,
  "signerPhone" TEXT,
  "signatureDataUrl" TEXT NOT NULL,
  "signedIpAddress" TEXT,
  "signedUserAgent" TEXT,
  "signedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractApprovalLog" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "clientPortalAccessId" TEXT,
  "action" TEXT NOT NULL,
  "comment" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractApprovalLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractSignature_contractId_clientPortalAccessId_key" ON "ContractSignature"("contractId", "clientPortalAccessId");
CREATE INDEX "ContractSignature_contractId_idx" ON "ContractSignature"("contractId");
CREATE INDEX "ContractSignature_clientPortalAccessId_idx" ON "ContractSignature"("clientPortalAccessId");
CREATE INDEX "ContractSignature_status_idx" ON "ContractSignature"("status");
CREATE INDEX "ContractSignature_signedAt_idx" ON "ContractSignature"("signedAt");
CREATE INDEX "ContractSignature_createdAt_idx" ON "ContractSignature"("createdAt");

CREATE INDEX "ContractApprovalLog_contractId_idx" ON "ContractApprovalLog"("contractId");
CREATE INDEX "ContractApprovalLog_clientPortalAccessId_idx" ON "ContractApprovalLog"("clientPortalAccessId");
CREATE INDEX "ContractApprovalLog_action_idx" ON "ContractApprovalLog"("action");
CREATE INDEX "ContractApprovalLog_createdAt_idx" ON "ContractApprovalLog"("createdAt");

ALTER TABLE "ContractSignature"
  ADD CONSTRAINT "ContractSignature_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "JobContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractSignature"
  ADD CONSTRAINT "ContractSignature_clientPortalAccessId_fkey"
  FOREIGN KEY ("clientPortalAccessId") REFERENCES "ClientPortalToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractApprovalLog"
  ADD CONSTRAINT "ContractApprovalLog_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "JobContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractApprovalLog"
  ADD CONSTRAINT "ContractApprovalLog_clientPortalAccessId_fkey"
  FOREIGN KEY ("clientPortalAccessId") REFERENCES "ClientPortalToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
