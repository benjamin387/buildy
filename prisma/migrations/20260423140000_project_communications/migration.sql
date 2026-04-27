-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'PHONE', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateTable
CREATE TABLE "ProjectCommunicationLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "channel" "CommunicationChannel" NOT NULL,
    "direction" "CommunicationDirection" NOT NULL DEFAULT 'INTERNAL',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "participants" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCommunicationLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "ProjectCommunicationLog_projectId_idx" ON "ProjectCommunicationLog"("projectId");
CREATE INDEX "ProjectCommunicationLog_createdById_idx" ON "ProjectCommunicationLog"("createdById");
CREATE INDEX "ProjectCommunicationLog_channel_idx" ON "ProjectCommunicationLog"("channel");
CREATE INDEX "ProjectCommunicationLog_direction_idx" ON "ProjectCommunicationLog"("direction");
CREATE INDEX "ProjectCommunicationLog_occurredAt_idx" ON "ProjectCommunicationLog"("occurredAt");

-- Foreign Keys
ALTER TABLE "ProjectCommunicationLog" ADD CONSTRAINT "ProjectCommunicationLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCommunicationLog" ADD CONSTRAINT "ProjectCommunicationLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

