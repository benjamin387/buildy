-- AI Orchestrator setting (singleton)
-- Stores automation mode + last run summary for scheduling + exec visibility.

CREATE TABLE IF NOT EXISTS "AIAutomationSetting" (
  "id" TEXT NOT NULL,
  "mode" "AIAutomationMode" NOT NULL DEFAULT 'ASSISTED',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "lastRunAt" TIMESTAMP(3),
  "lastRunSummary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIAutomationSetting_pkey" PRIMARY KEY ("id")
);

-- Ensure singleton exists
INSERT INTO "AIAutomationSetting" ("id", "mode", "isActive", "createdAt", "updatedAt")
SELECT 'GLOBAL', 'ASSISTED', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "AIAutomationSetting" WHERE "id" = 'GLOBAL');

