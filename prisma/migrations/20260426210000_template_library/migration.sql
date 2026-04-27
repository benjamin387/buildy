-- Template Library

DO $$ BEGIN
  CREATE TYPE "TemplateCategory" AS ENUM (
    'QUOTATION_TERMS',
    'CONTRACT_CLAUSE',
    'PROPOSAL_SECTION',
    'EMAIL',
    'WHATSAPP',
    'ROOM',
    'BOQ_ITEM',
    'PAYMENT_TERM',
    'VARIATION_ORDER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TemplateLibraryItem" (
  "id" TEXT NOT NULL,
  "category" "TemplateCategory" NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "content" TEXT NOT NULL,
  "variablesJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TemplateLibraryItem_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "TemplateLibraryItem"
    ADD CONSTRAINT "TemplateLibraryItem_category_code_key" UNIQUE ("category", "code");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "TemplateLibraryItem_category_idx" ON "TemplateLibraryItem" ("category");
CREATE INDEX IF NOT EXISTS "TemplateLibraryItem_code_idx" ON "TemplateLibraryItem" ("code");
CREATE INDEX IF NOT EXISTS "TemplateLibraryItem_isActive_idx" ON "TemplateLibraryItem" ("isActive");
CREATE INDEX IF NOT EXISTS "TemplateLibraryItem_createdAt_idx" ON "TemplateLibraryItem" ("createdAt");

