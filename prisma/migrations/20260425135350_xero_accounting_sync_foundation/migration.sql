-- Xero accounting sync foundation (incremental + safe).

DO $$ BEGIN
  CREATE TYPE "AccountingProvider" AS ENUM ('XERO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AccountingConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AccountingMappingType" AS ENUM (
    'TAX_CODE',
    'SALES_ACCOUNT',
    'PURCHASE_ACCOUNT',
    'PAYMENT_ACCOUNT',
    'ITEM_CODE',
    'TRACKING_CATEGORY',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AccountingSyncEntityType" AS ENUM (
    'INVOICE',
    'SUPPLIER_BILL',
    'PAYMENT_RECEIPT',
    'CLIENT',
    'VENDOR',
    'ITEM_MASTER',
    'TAX_CODE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AccountingSyncDirection" AS ENUM ('PUSH', 'PULL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AccountingSyncStatus" AS ENUM ('PENDING', 'SKIPPED', 'SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AccountingConnection" (
  "id" TEXT NOT NULL,
  "provider" "AccountingProvider" NOT NULL DEFAULT 'XERO',
  "tenantId" TEXT,
  "organisationName" TEXT,
  "status" "AccountingConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "connectedAt" TIMESTAMP(3),
  "refreshedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountingConnection_provider_key"
  ON "AccountingConnection"("provider");
CREATE INDEX IF NOT EXISTS "AccountingConnection_status_idx" ON "AccountingConnection"("status");
CREATE INDEX IF NOT EXISTS "AccountingConnection_connectedAt_idx" ON "AccountingConnection"("connectedAt");
CREATE INDEX IF NOT EXISTS "AccountingConnection_refreshedAt_idx" ON "AccountingConnection"("refreshedAt");

CREATE TABLE IF NOT EXISTS "TaxCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "provider" "AccountingProvider" NOT NULL DEFAULT 'XERO',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaxCode_provider_code_key" ON "TaxCode"("provider", "code");
CREATE INDEX IF NOT EXISTS "TaxCode_provider_idx" ON "TaxCode"("provider");
CREATE INDEX IF NOT EXISTS "TaxCode_code_idx" ON "TaxCode"("code");
CREATE INDEX IF NOT EXISTS "TaxCode_isActive_idx" ON "TaxCode"("isActive");
CREATE INDEX IF NOT EXISTS "TaxCode_createdAt_idx" ON "TaxCode"("createdAt");

CREATE TABLE IF NOT EXISTS "AccountMapping" (
  "id" TEXT NOT NULL,
  "provider" "AccountingProvider" NOT NULL DEFAULT 'XERO',
  "mappingType" "AccountingMappingType" NOT NULL,
  "internalKey" TEXT NOT NULL,
  "externalCode" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountMapping_provider_mappingType_internalKey_key"
  ON "AccountMapping"("provider", "mappingType", "internalKey");
CREATE INDEX IF NOT EXISTS "AccountMapping_provider_idx" ON "AccountMapping"("provider");
CREATE INDEX IF NOT EXISTS "AccountMapping_mappingType_idx" ON "AccountMapping"("mappingType");
CREATE INDEX IF NOT EXISTS "AccountMapping_isActive_idx" ON "AccountMapping"("isActive");
CREATE INDEX IF NOT EXISTS "AccountMapping_createdAt_idx" ON "AccountMapping"("createdAt");

CREATE TABLE IF NOT EXISTS "AccountingSyncLog" (
  "id" TEXT NOT NULL,
  "provider" "AccountingProvider" NOT NULL DEFAULT 'XERO',
  "entityType" "AccountingSyncEntityType" NOT NULL,
  "internalId" TEXT NOT NULL,
  "externalId" TEXT,
  "direction" "AccountingSyncDirection" NOT NULL DEFAULT 'PUSH',
  "status" "AccountingSyncStatus" NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountingSyncLog_provider_idx" ON "AccountingSyncLog"("provider");
CREATE INDEX IF NOT EXISTS "AccountingSyncLog_entityType_idx" ON "AccountingSyncLog"("entityType");
CREATE INDEX IF NOT EXISTS "AccountingSyncLog_internalId_idx" ON "AccountingSyncLog"("internalId");
CREATE INDEX IF NOT EXISTS "AccountingSyncLog_status_idx" ON "AccountingSyncLog"("status");
CREATE INDEX IF NOT EXISTS "AccountingSyncLog_syncedAt_idx" ON "AccountingSyncLog"("syncedAt");
CREATE INDEX IF NOT EXISTS "AccountingSyncLog_entityType_internalId_idx" ON "AccountingSyncLog"("entityType", "internalId");

