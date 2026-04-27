-- RenameEnum
ALTER TYPE "ProjectMilestoneStatus" RENAME TO "MilestoneStatus";

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM (
  'LEAD',
  'QUOTING',
  'CONTRACTED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED'
);

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM (
  'NOT_BILLED',
  'INVOICING',
  'PARTIALLY_COLLECTED',
  'COLLECTED',
  'OVERDUE'
);

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM (
  'OWNER',
  'PROJECT_MANAGER',
  'DESIGNER',
  'QS',
  'SITE_SUPERVISOR',
  'FINANCE',
  'ADMIN',
  'VIEWER'
);

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM (
  'TODO',
  'IN_PROGRESS',
  'DONE',
  'BLOCKED',
  'CANCELLED'
);

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN "projectCode" TEXT,
  ADD COLUMN "clientName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "clientCompany" TEXT,
  ADD COLUMN "clientEmail" TEXT,
  ADD COLUMN "clientPhone" TEXT,
  ADD COLUMN "siteAddress" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "projectType" TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'LEAD',
  ADD COLUMN "quotationStatus" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "contractStatus" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "billingStatus" "BillingStatus" NOT NULL DEFAULT 'NOT_BILLED',
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "targetCompletionDate" TIMESTAMP(3),
  ADD COLUMN "actualCompletionDate" TIMESTAMP(3),
  ADD COLUMN "contractValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "revisedContractValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "estimatedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "committedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "actualCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "projectedProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "actualProfit" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Indexes
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");
CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_projectCode_idx" ON "Project"("projectCode");

-- RenameColumn
ALTER TABLE "ProjectMilestone" RENAME COLUMN "completedAt" TO "completedDate";

-- CreateTable
CREATE TABLE "ProjectRoleAssignment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "role" "ProjectRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "milestoneId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "assignedTo" TEXT,
  "assignedEmail" TEXT,
  "roleResponsible" "ProjectRole",
  "startDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "completedDate" TIMESTAMP(3),
  "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectProgressLog" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "logDate" TIMESTAMP(3) NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "delayReason" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectProgressLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "ProjectRoleAssignment_projectId_idx" ON "ProjectRoleAssignment"("projectId");
CREATE INDEX "ProjectRoleAssignment_role_idx" ON "ProjectRoleAssignment"("role");
CREATE INDEX "ProjectRoleAssignment_userEmail_idx" ON "ProjectRoleAssignment"("userEmail");
CREATE UNIQUE INDEX "ProjectRoleAssignment_projectId_userEmail_role_key" ON "ProjectRoleAssignment"("projectId", "userEmail", "role");

CREATE INDEX "ProjectTask_projectId_idx" ON "ProjectTask"("projectId");
CREATE INDEX "ProjectTask_milestoneId_idx" ON "ProjectTask"("milestoneId");
CREATE INDEX "ProjectTask_status_idx" ON "ProjectTask"("status");
CREATE INDEX "ProjectTask_priority_idx" ON "ProjectTask"("priority");
CREATE INDEX "ProjectTask_dueDate_idx" ON "ProjectTask"("dueDate");

CREATE INDEX "ProjectProgressLog_projectId_idx" ON "ProjectProgressLog"("projectId");
CREATE INDEX "ProjectProgressLog_logDate_idx" ON "ProjectProgressLog"("logDate");

-- Foreign Keys
ALTER TABLE "ProjectRoleAssignment" ADD CONSTRAINT "ProjectRoleAssignment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_milestoneId_fkey"
  FOREIGN KEY ("milestoneId") REFERENCES "ProjectMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectProgressLog" ADD CONSTRAINT "ProjectProgressLog_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

