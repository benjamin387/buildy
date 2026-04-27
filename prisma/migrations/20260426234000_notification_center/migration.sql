-- Notification Center (Unified Inbox)

DO $$ BEGIN
  CREATE TYPE "NotificationSeverity" AS ENUM (
    'INFO',
    'SUCCESS',
    'WARNING',
    'CRITICAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM (
    'IN_APP',
    'EMAIL',
    'WHATSAPP'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "role" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
  "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMPTZ,
  "actionUrl" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_user_unread_idx" ON "Notification" ("userEmail", "isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_role_idx" ON "Notification" ("role", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_severity_idx" ON "Notification" ("severity");
CREATE INDEX IF NOT EXISTS "Notification_channel_idx" ON "Notification" ("channel");
CREATE INDEX IF NOT EXISTS "Notification_entity_idx" ON "Notification" ("entityType", "entityId", "createdAt");

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "enableInApp" BOOLEAN NOT NULL DEFAULT true,
  "enableEmail" BOOLEAN NOT NULL DEFAULT false,
  "enableWhatsApp" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStart" TEXT,
  "quietHoursEnd" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "NotificationPreference"
    ADD CONSTRAINT "NotificationPreference_userEmail_key" UNIQUE ("userEmail");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "NotificationPreference_userEmail_idx" ON "NotificationPreference" ("userEmail");

