-- Client delivery + communication hardening (incremental + safe).

-- 1) Add enum values
DO $$ BEGIN
  ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'LINK';
EXCEPTION WHEN undefined_object THEN
  -- Type may not exist yet in some environments.
  NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "MessageRelatedType" ADD VALUE IF NOT EXISTS 'DESIGN_PRESENTATION';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "PublicDocumentType" ADD VALUE IF NOT EXISTS 'DESIGN_PRESENTATION';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "CommunicationChannel" ADD VALUE IF NOT EXISTS 'LINK';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 2) Outbound message: link tracking + viewed timestamp
ALTER TABLE "OutboundMessage"
  ADD COLUMN IF NOT EXISTS "publicDocumentLinkId" TEXT;

ALTER TABLE "OutboundMessage"
  ADD COLUMN IF NOT EXISTS "viewedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "OutboundMessage_publicDocumentLinkId_idx" ON "OutboundMessage"("publicDocumentLinkId");
CREATE INDEX IF NOT EXISTS "OutboundMessage_viewedAt_idx" ON "OutboundMessage"("viewedAt");

DO $$ BEGIN
  ALTER TABLE "OutboundMessage"
    ADD CONSTRAINT "OutboundMessage_publicDocumentLinkId_fkey"
    FOREIGN KEY ("publicDocumentLinkId") REFERENCES "PublicDocumentLink"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

