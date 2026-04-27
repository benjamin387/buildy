-- Leads engine for sales pipeline (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "LeadStatus" AS ENUM (
    'NEW',
    'CONTACTED',
    'QUALIFYING',
    'SITE_VISIT_SCHEDULED',
    'QUOTATION_PENDING',
    'CONVERTED',
    'LOST'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PropertyCategory" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ResidentialPropertyType" AS ENUM ('HDB', 'CONDO', 'LANDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "HdbType" AS ENUM (
    'ONE_ROOM',
    'TWO_ROOM',
    'THREE_ROOM',
    'FOUR_ROOM',
    'FIVE_ROOM',
    'EXECUTIVE',
    'JUMBO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CondoType" AS ENUM (
    'CONDOMINIUM',
    'APARTMENT',
    'WALK_UP',
    'CLUSTER_HOUSE',
    'EXECUTIVE_CONDOMINIUM'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LandedType" AS ENUM (
    'TERRACED_HOUSE',
    'DETACHED_HOUSE',
    'SEMI_DETACHED_HOUSE',
    'CORNER_TERRACE',
    'BUNGALOW_HOUSE',
    'GOOD_CLASS_BUNGALOW',
    'SHOPHOUSE',
    'LAND_ONLY',
    'TOWN_HOUSE',
    'CONSERVATION_HOUSE',
    'CLUSTER_HOUSE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DesignStyle" AS ENUM (
    'MODERN',
    'MINIMALIST',
    'INDUSTRIAL',
    'SCANDINAVIAN',
    'CONTEMPORARY',
    'OTHERS'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeadActivityType" AS ENUM (
    'CALL',
    'WHATSAPP',
    'EMAIL',
    'SITE_VISIT',
    'NOTE',
    'FOLLOW_UP',
    'LOST_REASON'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT NOT NULL,
  "leadNumber" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "source" TEXT,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "assignedSalesName" TEXT,
  "assignedSalesEmail" TEXT,
  "projectAddress" TEXT NOT NULL,
  "projectType" "ProjectType" NOT NULL DEFAULT 'RESIDENTIAL',
  "propertyCategory" "PropertyCategory" NOT NULL DEFAULT 'RESIDENTIAL',
  "residentialPropertyType" "ResidentialPropertyType",
  "hdbType" "HdbType",
  "condoType" "CondoType",
  "landedType" "LandedType",
  "preferredDesignStyle" "DesignStyle",
  "requirementSummary" TEXT,
  "notes" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "convertedProjectId" TEXT,
  "convertedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Lead_leadNumber_key" ON "Lead"("leadNumber");
CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead"("status");
CREATE INDEX IF NOT EXISTS "Lead_assignedSalesEmail_idx" ON "Lead"("assignedSalesEmail");
CREATE INDEX IF NOT EXISTS "Lead_projectType_idx" ON "Lead"("projectType");
CREATE INDEX IF NOT EXISTS "Lead_propertyCategory_idx" ON "Lead"("propertyCategory");
CREATE INDEX IF NOT EXISTS "Lead_residentialPropertyType_idx" ON "Lead"("residentialPropertyType");
CREATE INDEX IF NOT EXISTS "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx" ON "Lead"("createdAt");
CREATE INDEX IF NOT EXISTS "Lead_convertedProjectId_idx" ON "Lead"("convertedProjectId");

DO $$ BEGIN
  ALTER TABLE "Lead"
    ADD CONSTRAINT "Lead_convertedProjectId_fkey"
    FOREIGN KEY ("convertedProjectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LeadActivity" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "activityType" "LeadActivityType" NOT NULL,
  "channel" "CommunicationChannel" NOT NULL DEFAULT 'OTHER',
  "summary" TEXT NOT NULL,
  "notes" TEXT,
  "followUpAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");
CREATE INDEX IF NOT EXISTS "LeadActivity_activityType_idx" ON "LeadActivity"("activityType");
CREATE INDEX IF NOT EXISTS "LeadActivity_channel_idx" ON "LeadActivity"("channel");
CREATE INDEX IF NOT EXISTS "LeadActivity_followUpAt_idx" ON "LeadActivity"("followUpAt");
CREATE INDEX IF NOT EXISTS "LeadActivity_createdAt_idx" ON "LeadActivity"("createdAt");

DO $$ BEGIN
  ALTER TABLE "LeadActivity"
    ADD CONSTRAINT "LeadActivity_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

