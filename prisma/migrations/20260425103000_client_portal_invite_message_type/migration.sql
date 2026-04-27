-- Add message related type for client portal invite (incremental + safe).

DO $$ BEGIN
  ALTER TYPE "MessageRelatedType" ADD VALUE IF NOT EXISTS 'CLIENT_PORTAL_INVITE';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

