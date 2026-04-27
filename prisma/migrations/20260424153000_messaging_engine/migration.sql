-- Messaging engine: outbound email/WhatsApp + templates + public document links (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'WHATSAPP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OutboundMessageStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MessageRelatedType" AS ENUM (
    'QUOTATION',
    'CONTRACT',
    'INVOICE',
    'PURCHASE_ORDER',
    'SUBCONTRACT',
    'SUPPLIER_BILL',
    'COLLECTION_REMINDER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PublicDocumentType" AS ENUM (
    'QUOTATION',
    'CONTRACT',
    'INVOICE',
    'PURCHASE_ORDER',
    'SUBCONTRACT',
    'SUPPLIER_BILL',
    'COLLECTION_REMINDER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OutboundMessage" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "relatedType" "MessageRelatedType" NOT NULL,
  "relatedId" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientAddress" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "status" "OutboundMessageStatus" NOT NULL DEFAULT 'DRAFT',
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OutboundMessage_projectId_idx" ON "OutboundMessage"("projectId");
CREATE INDEX IF NOT EXISTS "OutboundMessage_relatedType_relatedId_idx" ON "OutboundMessage"("relatedType", "relatedId");
CREATE INDEX IF NOT EXISTS "OutboundMessage_channel_idx" ON "OutboundMessage"("channel");
CREATE INDEX IF NOT EXISTS "OutboundMessage_status_idx" ON "OutboundMessage"("status");
CREATE INDEX IF NOT EXISTS "OutboundMessage_createdAt_idx" ON "OutboundMessage"("createdAt");
CREATE INDEX IF NOT EXISTS "OutboundMessage_sentAt_idx" ON "OutboundMessage"("sentAt");

DO $$ BEGIN
  ALTER TABLE "OutboundMessage"
    ADD CONSTRAINT "OutboundMessage_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MessageAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "documentType" "PublicDocumentType" NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");
CREATE INDEX IF NOT EXISTS "MessageAttachment_documentType_documentId_idx" ON "MessageAttachment"("documentType", "documentId");
CREATE INDEX IF NOT EXISTS "MessageAttachment_createdAt_idx" ON "MessageAttachment"("createdAt");

DO $$ BEGIN
  ALTER TABLE "MessageAttachment"
    ADD CONSTRAINT "MessageAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "OutboundMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MessageTemplate" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "subjectTemplate" TEXT,
  "bodyTemplate" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MessageTemplate_code_key" ON "MessageTemplate"("code");
CREATE INDEX IF NOT EXISTS "MessageTemplate_channel_idx" ON "MessageTemplate"("channel");
CREATE INDEX IF NOT EXISTS "MessageTemplate_isActive_idx" ON "MessageTemplate"("isActive");
CREATE INDEX IF NOT EXISTS "MessageTemplate_createdAt_idx" ON "MessageTemplate"("createdAt");

CREATE TABLE IF NOT EXISTS "PublicDocumentLink" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "documentType" "PublicDocumentType" NOT NULL,
  "documentId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicDocumentLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PublicDocumentLink_token_key" ON "PublicDocumentLink"("token");
CREATE INDEX IF NOT EXISTS "PublicDocumentLink_projectId_idx" ON "PublicDocumentLink"("projectId");
CREATE INDEX IF NOT EXISTS "PublicDocumentLink_documentType_documentId_idx" ON "PublicDocumentLink"("documentType", "documentId");
CREATE INDEX IF NOT EXISTS "PublicDocumentLink_expiresAt_idx" ON "PublicDocumentLink"("expiresAt");
CREATE INDEX IF NOT EXISTS "PublicDocumentLink_viewedAt_idx" ON "PublicDocumentLink"("viewedAt");
CREATE INDEX IF NOT EXISTS "PublicDocumentLink_isActive_idx" ON "PublicDocumentLink"("isActive");
CREATE INDEX IF NOT EXISTS "PublicDocumentLink_createdAt_idx" ON "PublicDocumentLink"("createdAt");

DO $$ BEGIN
  ALTER TABLE "PublicDocumentLink"
    ADD CONSTRAINT "PublicDocumentLink_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

