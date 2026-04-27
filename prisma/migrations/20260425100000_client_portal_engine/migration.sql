-- Client portal engine (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "ClientPortalMessageStatus" AS ENUM ('NEW', 'READ', 'RESOLVED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ClientPortalAccount" (
  "id" TEXT NOT NULL,
  "clientId" TEXT,
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientPortalAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientPortalAccount_email_key" ON "ClientPortalAccount"("email");
CREATE INDEX IF NOT EXISTS "ClientPortalAccount_clientId_idx" ON "ClientPortalAccount"("clientId");
CREATE INDEX IF NOT EXISTS "ClientPortalAccount_projectId_idx" ON "ClientPortalAccount"("projectId");
CREATE INDEX IF NOT EXISTS "ClientPortalAccount_isActive_idx" ON "ClientPortalAccount"("isActive");
CREATE INDEX IF NOT EXISTS "ClientPortalAccount_lastLoginAt_idx" ON "ClientPortalAccount"("lastLoginAt");
CREATE INDEX IF NOT EXISTS "ClientPortalAccount_createdAt_idx" ON "ClientPortalAccount"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ClientPortalAccount"
    ADD CONSTRAINT "ClientPortalAccount_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClientPortalAccount"
    ADD CONSTRAINT "ClientPortalAccount_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ClientPortalToken" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientPortalToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientPortalToken_token_key" ON "ClientPortalToken"("token");
CREATE INDEX IF NOT EXISTS "ClientPortalToken_accountId_idx" ON "ClientPortalToken"("accountId");
CREATE INDEX IF NOT EXISTS "ClientPortalToken_expiresAt_idx" ON "ClientPortalToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "ClientPortalToken_usedAt_idx" ON "ClientPortalToken"("usedAt");
CREATE INDEX IF NOT EXISTS "ClientPortalToken_createdAt_idx" ON "ClientPortalToken"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ClientPortalToken"
    ADD CONSTRAINT "ClientPortalToken_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "ClientPortalAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ClientPortalMessage" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "ClientPortalMessageStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientPortalMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClientPortalMessage_projectId_idx" ON "ClientPortalMessage"("projectId");
CREATE INDEX IF NOT EXISTS "ClientPortalMessage_accountId_idx" ON "ClientPortalMessage"("accountId");
CREATE INDEX IF NOT EXISTS "ClientPortalMessage_status_idx" ON "ClientPortalMessage"("status");
CREATE INDEX IF NOT EXISTS "ClientPortalMessage_createdAt_idx" ON "ClientPortalMessage"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ClientPortalMessage"
    ADD CONSTRAINT "ClientPortalMessage_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClientPortalMessage"
    ADD CONSTRAINT "ClientPortalMessage_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "ClientPortalAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

