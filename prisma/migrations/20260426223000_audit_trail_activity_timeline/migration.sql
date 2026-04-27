-- Audit Trail + Activity Timeline

DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE',
    'STATUS_CHANGE',
    'SEND',
    'APPROVE',
    'REJECT',
    'SIGN',
    'LOGIN',
    'EXPORT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AuditSource" AS ENUM (
    'USER',
    'SYSTEM',
    'AI'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ActivitySeverity" AS ENUM (
    'INFO',
    'WARNING',
    'IMPORTANT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "actorName" TEXT,
  "actorEmail" TEXT,
  "actorRole" TEXT,
  "source" "AuditSource" NOT NULL DEFAULT 'USER',
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "metadataJson" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_entity_idx" ON "AuditLog" ("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog" ("action");
CREATE INDEX IF NOT EXISTS "AuditLog_source_idx" ON "AuditLog" ("source");
CREATE INDEX IF NOT EXISTS "AuditLog_actorEmail_idx" ON "AuditLog" ("actorEmail");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");

CREATE TABLE IF NOT EXISTS "ActivityEvent" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "severity" "ActivitySeverity" NOT NULL DEFAULT 'INFO',
  "relatedDocumentType" TEXT,
  "relatedDocumentId" TEXT,
  "createdBy" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ActivityEvent_entity_idx" ON "ActivityEvent" ("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityEvent_severity_idx" ON "ActivityEvent" ("severity");
CREATE INDEX IF NOT EXISTS "ActivityEvent_createdAt_idx" ON "ActivityEvent" ("createdAt");

