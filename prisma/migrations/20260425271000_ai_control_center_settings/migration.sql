-- AI Control Center settings
-- Extends existing AIAutomationSetting singleton with allow/approval toggles.
-- Also renames column "mode" -> "automationMode" to match Prisma schema.

-- Rename mode -> automationMode (if not already renamed)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'AIAutomationSetting' AND column_name = 'mode'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'AIAutomationSetting' AND column_name = 'automationMode'
  ) THEN
    ALTER TABLE "AIAutomationSetting" RENAME COLUMN "mode" TO "automationMode";
  END IF;
END $$;

ALTER TABLE "AIAutomationSetting"
  ADD COLUMN IF NOT EXISTS "allowLeadFollowUp" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "allowDesignGeneration" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "allowQuotationDrafting" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "allowPaymentReminder" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "allowCollectionsEscalation" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "allowSalesPackageGeneration" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "requireApprovalForQuotations" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "requireApprovalForContracts" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "requireApprovalForInvoices" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "requireApprovalForPricingChanges" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "requireApprovalForLegalEscalation" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "updatedBy" TEXT;

CREATE INDEX IF NOT EXISTS "AIAutomationSetting_automationMode_idx" ON "AIAutomationSetting"("automationMode");
CREATE INDEX IF NOT EXISTS "AIAutomationSetting_isActive_idx" ON "AIAutomationSetting"("isActive");
CREATE INDEX IF NOT EXISTS "AIAutomationSetting_updatedBy_idx" ON "AIAutomationSetting"("updatedBy");

-- Ensure singleton exists (forward-compatible if older migration didn't insert)
INSERT INTO "AIAutomationSetting" (
  "id",
  "automationMode",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT 'GLOBAL', 'ASSISTED', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "AIAutomationSetting" WHERE "id" = 'GLOBAL');

