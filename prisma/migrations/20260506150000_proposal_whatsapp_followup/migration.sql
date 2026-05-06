CREATE TYPE "ProposalActivityType" AS ENUM ('SENT', 'VIEWED', 'REMINDER', 'APPROVED');

CREATE TABLE "ProposalActivity" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "type" "ProposalActivityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProposalActivity_proposalId_idx" ON "ProposalActivity"("proposalId");
CREATE INDEX "ProposalActivity_type_idx" ON "ProposalActivity"("type");
CREATE INDEX "ProposalActivity_createdAt_idx" ON "ProposalActivity"("createdAt");
CREATE INDEX "ProposalActivity_proposalId_createdAt_idx" ON "ProposalActivity"("proposalId", "createdAt");

ALTER TABLE "ProposalActivity"
ADD CONSTRAINT "ProposalActivity_proposalId_fkey"
FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
