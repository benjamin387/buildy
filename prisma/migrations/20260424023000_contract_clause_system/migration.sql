-- Contract clause system (templates + per-contract clauses) + signedAt.
-- Safe incremental migration: add new tables and add nullable signedAt to existing JobContract.

-- 1) Enum for clause categories.
DO $$ BEGIN
  CREATE TYPE "ClauseTemplateCategory" AS ENUM ('SCOPE', 'PAYMENT', 'VARIATION', 'TIMELINE', 'WARRANTY', 'LEGAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Add signedAt to JobContract (Contract model @@map("JobContract")).
ALTER TABLE "JobContract"
  ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "JobContract_signedAt_idx" ON "JobContract"("signedAt");

-- 3) Clause templates.
CREATE TABLE IF NOT EXISTS "ClauseTemplate" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" "ClauseTemplateCategory" NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClauseTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClauseTemplate_code_key" ON "ClauseTemplate"("code");
CREATE INDEX IF NOT EXISTS "ClauseTemplate_category_idx" ON "ClauseTemplate"("category");
CREATE INDEX IF NOT EXISTS "ClauseTemplate_isDefault_idx" ON "ClauseTemplate"("isDefault");
CREATE INDEX IF NOT EXISTS "ClauseTemplate_createdAt_idx" ON "ClauseTemplate"("createdAt");

-- 4) Contract clauses (snapshot per contract).
CREATE TABLE IF NOT EXISTS "ContractClause" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "clauseKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isEditable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractClause_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContractClause_contractId_clauseKey_key"
  ON "ContractClause"("contractId", "clauseKey");

CREATE INDEX IF NOT EXISTS "ContractClause_contractId_idx" ON "ContractClause"("contractId");
CREATE INDEX IF NOT EXISTS "ContractClause_sortOrder_idx" ON "ContractClause"("sortOrder");
CREATE INDEX IF NOT EXISTS "ContractClause_clauseKey_idx" ON "ContractClause"("clauseKey");

DO $$ BEGIN
  ALTER TABLE "ContractClause"
    ADD CONSTRAINT "ContractClause_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "JobContract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

