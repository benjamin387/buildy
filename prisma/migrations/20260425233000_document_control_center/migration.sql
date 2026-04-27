-- Document control center foundation (Document + DocumentVersion) - incremental and safe.

DO $$ BEGIN
  CREATE TYPE "DocumentEntityType" AS ENUM (
    'DESIGN_PRESENTATION',
    'QUOTATION',
    'CONTRACT',
    'INVOICE',
    'PURCHASE_ORDER',
    'SUBCONTRACT',
    'SUPPLIER_BILL',
    'HANDOVER_FORM',
    'VARIATION_ORDER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentVersionStatus" AS ENUM (
    'DRAFT',
    'GENERATED',
    'SENT',
    'SIGNED',
    'SUPERSEDED',
    'REVOKED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Document" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "entityType" "DocumentEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "documentNumber" TEXT,
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT,
  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Document"
    ADD CONSTRAINT "Document_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Document_entityType_entityId_key" ON "Document"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "Document_projectId_idx" ON "Document"("projectId");
CREATE INDEX IF NOT EXISTS "Document_entityType_idx" ON "Document"("entityType");
CREATE INDEX IF NOT EXISTS "Document_status_idx" ON "Document"("status");
CREATE INDEX IF NOT EXISTS "Document_lockedAt_idx" ON "Document"("lockedAt");
CREATE INDEX IF NOT EXISTS "Document_updatedAt_idx" ON "Document"("updatedAt");
CREATE INDEX IF NOT EXISTS "Document_createdAt_idx" ON "Document"("createdAt");

CREATE TABLE IF NOT EXISTS "DocumentVersion" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "DocumentVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "fileUrl" TEXT,
  "signedFileUrl" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "DocumentVersion"
    ADD CONSTRAINT "DocumentVersion_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");
CREATE INDEX IF NOT EXISTS "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");
CREATE INDEX IF NOT EXISTS "DocumentVersion_status_idx" ON "DocumentVersion"("status");
CREATE INDEX IF NOT EXISTS "DocumentVersion_createdAt_idx" ON "DocumentVersion"("createdAt");

