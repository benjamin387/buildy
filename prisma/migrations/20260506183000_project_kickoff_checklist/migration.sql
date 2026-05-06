CREATE TABLE "ProjectKickoffChecklist" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectKickoffChecklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectKickoffChecklist_projectId_itemKey_key"
ON "ProjectKickoffChecklist"("projectId", "itemKey");

CREATE INDEX "ProjectKickoffChecklist_projectId_idx"
ON "ProjectKickoffChecklist"("projectId");

CREATE INDEX "ProjectKickoffChecklist_isCompleted_idx"
ON "ProjectKickoffChecklist"("isCompleted");

ALTER TABLE "ProjectKickoffChecklist"
ADD CONSTRAINT "ProjectKickoffChecklist_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
