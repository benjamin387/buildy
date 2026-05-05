-- AI Sales Assistant + WhatsApp Follow-Up Engine
CREATE TABLE "ClientFollowUp" (
  "id" TEXT NOT NULL,
  "designBriefId" TEXT,
  "quotationId" TEXT,
  "proposalId" TEXT,
  "clientName" TEXT NOT NULL,
  "clientPhone" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "lastContactedAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3),
  "clientConcern" TEXT,
  "aiSuggestedReply" TEXT,
  "aiObjectionHandling" TEXT,
  "aiUpsellSuggestion" TEXT,
  "aiDiscountLimit" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientMessageTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "stage" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientMessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientFollowUp_designBriefId_idx" ON "ClientFollowUp"("designBriefId");
CREATE INDEX "ClientFollowUp_quotationId_idx" ON "ClientFollowUp"("quotationId");
CREATE INDEX "ClientFollowUp_stage_idx" ON "ClientFollowUp"("stage");
CREATE INDEX "ClientFollowUp_priority_idx" ON "ClientFollowUp"("priority");
CREATE INDEX "ClientFollowUp_status_idx" ON "ClientFollowUp"("status");
CREATE INDEX "ClientFollowUp_nextFollowUpAt_idx" ON "ClientFollowUp"("nextFollowUpAt");

CREATE INDEX "ClientMessageTemplate_channel_idx" ON "ClientMessageTemplate"("channel");
CREATE INDEX "ClientMessageTemplate_stage_idx" ON "ClientMessageTemplate"("stage");
CREATE INDEX "ClientMessageTemplate_isActive_idx" ON "ClientMessageTemplate"("isActive");

ALTER TABLE "ClientFollowUp"
  ADD CONSTRAINT "ClientFollowUp_designBriefId_fkey"
  FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientFollowUp"
  ADD CONSTRAINT "ClientFollowUp_quotationId_fkey"
  FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
