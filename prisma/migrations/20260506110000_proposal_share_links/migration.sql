CREATE TABLE "Proposal" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "publicToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Proposal_quotationId_key" ON "Proposal"("quotationId");
CREATE UNIQUE INDEX "Proposal_publicToken_key" ON "Proposal"("publicToken");
CREATE INDEX "Proposal_createdAt_idx" ON "Proposal"("createdAt");

ALTER TABLE "Proposal"
  ADD CONSTRAINT "Proposal_quotationId_fkey"
  FOREIGN KEY ("quotationId")
  REFERENCES "Quotation"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
