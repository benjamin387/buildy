-- Collections engine for overdue receivables (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "CollectionCaseStatus" AS ENUM (
    'OPEN',
    'REMINDER_SENT',
    'PROMISE_TO_PAY',
    'ESCALATED',
    'DISPUTED',
    'PAID',
    'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CollectionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CollectionActionType" AS ENUM (
    'EMAIL_REMINDER',
    'WHATSAPP_REMINDER',
    'CALL',
    'LETTER_OF_DEMAND',
    'LEGAL_ESCALATION',
    'MANUAL_NOTE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CollectionActionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CollectionChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'PHONE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollectionCase" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "caseNumber" TEXT NOT NULL,
  "debtorName" TEXT NOT NULL,
  "debtorEmail" TEXT,
  "debtorPhone" TEXT,
  "outstandingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "daysPastDue" INTEGER NOT NULL DEFAULT 0,
  "status" "CollectionCaseStatus" NOT NULL DEFAULT 'OPEN',
  "severity" "CollectionSeverity" NOT NULL DEFAULT 'LOW',
  "nextActionDate" TIMESTAMP(3),
  "assignedTo" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollectionCase_caseNumber_key" ON "CollectionCase"("caseNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "CollectionCase_invoiceId_key" ON "CollectionCase"("invoiceId");
CREATE INDEX IF NOT EXISTS "CollectionCase_projectId_idx" ON "CollectionCase"("projectId");
CREATE INDEX IF NOT EXISTS "CollectionCase_status_idx" ON "CollectionCase"("status");
CREATE INDEX IF NOT EXISTS "CollectionCase_severity_idx" ON "CollectionCase"("severity");
CREATE INDEX IF NOT EXISTS "CollectionCase_dueDate_idx" ON "CollectionCase"("dueDate");
CREATE INDEX IF NOT EXISTS "CollectionCase_daysPastDue_idx" ON "CollectionCase"("daysPastDue");
CREATE INDEX IF NOT EXISTS "CollectionCase_nextActionDate_idx" ON "CollectionCase"("nextActionDate");
CREATE INDEX IF NOT EXISTS "CollectionCase_updatedAt_idx" ON "CollectionCase"("updatedAt");

DO $$ BEGIN
  ALTER TABLE "CollectionCase"
    ADD CONSTRAINT "CollectionCase_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollectionCase"
    ADD CONSTRAINT "CollectionCase_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollectionAction" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "actionType" "CollectionActionType" NOT NULL,
  "channel" "CollectionChannel" NOT NULL,
  "status" "CollectionActionStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollectionAction_caseId_idx" ON "CollectionAction"("caseId");
CREATE INDEX IF NOT EXISTS "CollectionAction_status_idx" ON "CollectionAction"("status");
CREATE INDEX IF NOT EXISTS "CollectionAction_scheduledAt_idx" ON "CollectionAction"("scheduledAt");
CREATE INDEX IF NOT EXISTS "CollectionAction_completedAt_idx" ON "CollectionAction"("completedAt");

DO $$ BEGIN
  ALTER TABLE "CollectionAction"
    ADD CONSTRAINT "CollectionAction_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CollectionReminderTemplate" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "daysPastDue" INTEGER NOT NULL,
  "channel" "CollectionChannel" NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionReminderTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollectionReminderTemplate_code_key" ON "CollectionReminderTemplate"("code");
CREATE INDEX IF NOT EXISTS "CollectionReminderTemplate_daysPastDue_idx" ON "CollectionReminderTemplate"("daysPastDue");
CREATE INDEX IF NOT EXISTS "CollectionReminderTemplate_channel_idx" ON "CollectionReminderTemplate"("channel");
CREATE INDEX IF NOT EXISTS "CollectionReminderTemplate_isActive_idx" ON "CollectionReminderTemplate"("isActive");

