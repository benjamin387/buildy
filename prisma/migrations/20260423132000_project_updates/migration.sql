-- CreateEnum
CREATE TYPE "ProjectUpdateVisibility" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateTable
CREATE TABLE "ProjectUpdate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT,
    "visibility" "ProjectUpdateVisibility" NOT NULL DEFAULT 'INTERNAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectUpdate_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "ProjectUpdate_projectId_idx" ON "ProjectUpdate"("projectId");
CREATE INDEX "ProjectUpdate_authorId_idx" ON "ProjectUpdate"("authorId");
CREATE INDEX "ProjectUpdate_occurredAt_idx" ON "ProjectUpdate"("occurredAt");
CREATE INDEX "ProjectUpdate_visibility_idx" ON "ProjectUpdate"("visibility");

-- Foreign Keys
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

