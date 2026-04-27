-- WhatsApp/Telegram Lead Intake Bot Engine (incremental + safe).

-- Enums.
DO $$ BEGIN
  CREATE TYPE "LeadBotChannel" AS ENUM ('WHATSAPP', 'TELEGRAM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeadBotSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- LeadBotSession: conversational state store.
CREATE TABLE IF NOT EXISTS "LeadBotSession" (
  "id" TEXT NOT NULL,
  "channel" "LeadBotChannel" NOT NULL,
  "externalUserId" TEXT NOT NULL,
  "phoneNumber" TEXT,
  "telegramChatId" TEXT,
  "submittedByUserId" TEXT,
  "currentStep" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" "LeadBotSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadBotSession_pkey" PRIMARY KEY ("id")
);

-- FK to User (optional).
DO $$ BEGIN
  ALTER TABLE "LeadBotSession"
    ADD CONSTRAINT "LeadBotSession_submittedByUserId_fkey"
    FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- LeadAttachment: files received during intake.
CREATE TABLE IF NOT EXISTS "LeadAttachment" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "channel" "LeadBotChannel" NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "originalFileName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadAttachment_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "LeadAttachment"
    ADD CONSTRAINT "LeadAttachment_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Indexes.
CREATE INDEX IF NOT EXISTS "LeadBotSession_channel_idx" ON "LeadBotSession"("channel");
CREATE INDEX IF NOT EXISTS "LeadBotSession_externalUserId_idx" ON "LeadBotSession"("externalUserId");
CREATE INDEX IF NOT EXISTS "LeadBotSession_status_idx" ON "LeadBotSession"("status");
CREATE INDEX IF NOT EXISTS "LeadBotSession_updatedAt_idx" ON "LeadBotSession"("updatedAt");
CREATE INDEX IF NOT EXISTS "LeadBotSession_createdAt_idx" ON "LeadBotSession"("createdAt");
CREATE INDEX IF NOT EXISTS "LeadBotSession_channel_externalUserId_status_idx" ON "LeadBotSession"("channel", "externalUserId", "status");

CREATE INDEX IF NOT EXISTS "LeadAttachment_leadId_idx" ON "LeadAttachment"("leadId");
CREATE INDEX IF NOT EXISTS "LeadAttachment_channel_idx" ON "LeadAttachment"("channel");
CREATE INDEX IF NOT EXISTS "LeadAttachment_createdAt_idx" ON "LeadAttachment"("createdAt");

