-- Role Permission Rules (module/action matrix)

DO $$ BEGIN
  CREATE TYPE "PermissionModuleKey" AS ENUM (
    'DASHBOARD',
    'LEADS',
    'PROJECTS',
    'DESIGN',
    'QUOTATIONS',
    'CONTRACTS',
    'INVOICES',
    'RECEIPTS',
    'SUPPLIERS',
    'PURCHASE_ORDERS',
    'SUBCONTRACTS',
    'SUPPLIER_BILLS',
    'VARIATIONS',
    'COLLECTIONS',
    'CASHFLOW',
    'PNL',
    'DOCUMENTS',
    'CLIENT_PORTAL',
    'AI_ACTIONS',
    'AI_CONTROL',
    'AI_LEARNING',
    'SETTINGS',
    'AUDIT',
    'NOTIFICATIONS'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PermissionRule" (
  "id" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "moduleKey" "PermissionModuleKey" NOT NULL,
  "canView" BOOLEAN NOT NULL DEFAULT false,
  "canCreate" BOOLEAN NOT NULL DEFAULT false,
  "canEdit" BOOLEAN NOT NULL DEFAULT false,
  "canDelete" BOOLEAN NOT NULL DEFAULT false,
  "canApprove" BOOLEAN NOT NULL DEFAULT false,
  "canSend" BOOLEAN NOT NULL DEFAULT false,
  "canExport" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PermissionRule_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "PermissionRule"
    ADD CONSTRAINT "PermissionRule_roleKey_moduleKey_key" UNIQUE ("roleKey", "moduleKey");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "PermissionRule_role_idx" ON "PermissionRule" ("roleKey");
CREATE INDEX IF NOT EXISTS "PermissionRule_module_idx" ON "PermissionRule" ("moduleKey");

-- Seed defaults (do not overwrite if admin has already configured).
-- ADMIN
INSERT INTO "PermissionRule" (
  "id","roleKey","moduleKey","canView","canCreate","canEdit","canDelete","canApprove","canSend","canExport","createdAt","updatedAt"
)
SELECT
  concat('seed_admin_', lower("m"::text)),
  'ADMIN',
  "m",
  true,true,true,true,true,true,true,
  NOW(),NOW()
FROM unnest(enum_range(NULL::"PermissionModuleKey")) AS "m"
ON CONFLICT ("roleKey","moduleKey") DO NOTHING;

-- DIRECTOR: all view/create/edit/approve/send/export; no delete by default.
INSERT INTO "PermissionRule" (
  "id","roleKey","moduleKey","canView","canCreate","canEdit","canDelete","canApprove","canSend","canExport","createdAt","updatedAt"
)
SELECT
  concat('seed_director_', lower("m"::text)),
  'DIRECTOR',
  "m",
  true,true,true,false,true,true,true,
  NOW(),NOW()
FROM unnest(enum_range(NULL::"PermissionModuleKey")) AS "m"
ON CONFLICT ("roleKey","moduleKey") DO NOTHING;

-- PROJECT_MANAGER: projects + design workflow; read-only finance.
INSERT INTO "PermissionRule" ("id","roleKey","moduleKey","canView","canCreate","canEdit","canDelete","canApprove","canSend","canExport","createdAt","updatedAt")
VALUES
  ('seed_pm_dashboard','PROJECT_MANAGER','DASHBOARD', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_pm_notifications','PROJECT_MANAGER','NOTIFICATIONS', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_pm_leads','PROJECT_MANAGER','LEADS', true,true,true,false,false,false,false, NOW(),NOW()),
  ('seed_pm_projects','PROJECT_MANAGER','PROJECTS', true,true,true,false,false,false,false, NOW(),NOW()),
  ('seed_pm_design','PROJECT_MANAGER','DESIGN', true,true,true,false,false,false,false, NOW(),NOW()),
  ('seed_pm_quotations','PROJECT_MANAGER','QUOTATIONS', true,false,false,false,false,false,true, NOW(),NOW()),
  ('seed_pm_contracts','PROJECT_MANAGER','CONTRACTS', true,true,true,false,false,false,true, NOW(),NOW()),
  ('seed_pm_suppliers','PROJECT_MANAGER','SUPPLIERS', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_pm_documents','PROJECT_MANAGER','DOCUMENTS', true,false,false,false,false,false,true, NOW(),NOW()),
  ('seed_pm_collections','PROJECT_MANAGER','COLLECTIONS', false,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_pm_cashflow','PROJECT_MANAGER','CASHFLOW', false,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_pm_pnl','PROJECT_MANAGER','PNL', false,false,false,false,false,false,false, NOW(),NOW())
ON CONFLICT ("roleKey","moduleKey") DO NOTHING;

-- QS: quotations + variations, view projects/contracts.
INSERT INTO "PermissionRule" ("id","roleKey","moduleKey","canView","canCreate","canEdit","canDelete","canApprove","canSend","canExport","createdAt","updatedAt")
VALUES
  ('seed_qs_dashboard','QS','DASHBOARD', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_qs_notifications','QS','NOTIFICATIONS', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_qs_projects','QS','PROJECTS', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_qs_design','QS','DESIGN', true,true,true,false,false,false,false, NOW(),NOW()),
  ('seed_qs_quotations','QS','QUOTATIONS', true,true,true,false,true,false,true, NOW(),NOW()),
  ('seed_qs_variations','QS','VARIATIONS', true,true,true,false,true,false,true, NOW(),NOW()),
  ('seed_qs_contracts','QS','CONTRACTS', true,false,false,false,false,false,true, NOW(),NOW()),
  ('seed_qs_documents','QS','DOCUMENTS', true,false,false,false,false,false,true, NOW(),NOW())
ON CONFLICT ("roleKey","moduleKey") DO NOTHING;

-- FINANCE: invoicing/receipts/collections/cashflow/pnl; view projects/contracts/quotations/documents.
INSERT INTO "PermissionRule" ("id","roleKey","moduleKey","canView","canCreate","canEdit","canDelete","canApprove","canSend","canExport","createdAt","updatedAt")
VALUES
  ('seed_fin_dashboard','FINANCE','DASHBOARD', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_fin_notifications','FINANCE','NOTIFICATIONS', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_fin_projects','FINANCE','PROJECTS', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_fin_quotations','FINANCE','QUOTATIONS', true,false,false,false,false,false,true, NOW(),NOW()),
  ('seed_fin_contracts','FINANCE','CONTRACTS', true,false,false,false,false,false,true, NOW(),NOW()),
  ('seed_fin_invoices','FINANCE','INVOICES', true,true,true,false,false,true,true, NOW(),NOW()),
  ('seed_fin_receipts','FINANCE','RECEIPTS', true,true,true,false,false,false,true, NOW(),NOW()),
  ('seed_fin_collections','FINANCE','COLLECTIONS', true,true,true,false,false,true,true, NOW(),NOW()),
  ('seed_fin_cashflow','FINANCE','CASHFLOW', true,false,false,false,false,false,true, NOW(),NOW()),
  ('seed_fin_pnl','FINANCE','PNL', true,false,false,false,false,false,true, NOW(),NOW()),
  ('seed_fin_supplier_bills','FINANCE','SUPPLIER_BILLS', true,true,true,false,true,false,true, NOW(),NOW()),
  ('seed_fin_documents','FINANCE','DOCUMENTS', true,false,false,false,false,false,true, NOW(),NOW())
ON CONFLICT ("roleKey","moduleKey") DO NOTHING;

-- SUPPLIER: limited future-ready (no access by default besides notifications).
INSERT INTO "PermissionRule" ("id","roleKey","moduleKey","canView","canCreate","canEdit","canDelete","canApprove","canSend","canExport","createdAt","updatedAt")
VALUES
  ('seed_sup_notifications','SUPPLIER','NOTIFICATIONS', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_sup_dashboard','SUPPLIER','DASHBOARD', false,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_sup_suppliers','SUPPLIER','SUPPLIERS', true,false,false,false,false,false,false, NOW(),NOW())
ON CONFLICT ("roleKey","moduleKey") DO NOTHING;

-- CLIENT_VIEWER: client portal only.
INSERT INTO "PermissionRule" ("id","roleKey","moduleKey","canView","canCreate","canEdit","canDelete","canApprove","canSend","canExport","createdAt","updatedAt")
VALUES
  ('seed_cv_client_portal','CLIENT_VIEWER','CLIENT_PORTAL', true,false,false,false,false,false,false, NOW(),NOW()),
  ('seed_cv_notifications','CLIENT_VIEWER','NOTIFICATIONS', true,false,false,false,false,false,false, NOW(),NOW())
ON CONFLICT ("roleKey","moduleKey") DO NOTHING;
