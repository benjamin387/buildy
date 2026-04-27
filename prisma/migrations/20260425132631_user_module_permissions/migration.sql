-- User module permissions (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "PermissionLevel" AS ENUM ('NONE', 'VIEW', 'EDIT', 'APPROVE', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlatformModule" AS ENUM (
    'PROJECTS',
    'QUOTATIONS',
    'CONTRACTS',
    'INVOICES',
    'SUPPLIERS',
    'SETTINGS',
    'SECURITY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "UserModulePermission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "module" "PlatformModule" NOT NULL,
  "level" "PermissionLevel" NOT NULL DEFAULT 'NONE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserModulePermission_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "UserModulePermission"
    ADD CONSTRAINT "UserModulePermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UserModulePermission_userId_module_key"
  ON "UserModulePermission"("userId", "module");

CREATE INDEX IF NOT EXISTS "UserModulePermission_userId_idx" ON "UserModulePermission"("userId");
CREATE INDEX IF NOT EXISTS "UserModulePermission_module_idx" ON "UserModulePermission"("module");
CREATE INDEX IF NOT EXISTS "UserModulePermission_level_idx" ON "UserModulePermission"("level");
CREATE INDEX IF NOT EXISTS "UserModulePermission_createdAt_idx" ON "UserModulePermission"("createdAt");

