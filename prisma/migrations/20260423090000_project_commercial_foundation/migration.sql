-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM (
    'PROJECT_READ',
    'PROJECT_WRITE',
    'PROJECT_DELETE',
    'PROJECT_MEMBER_MANAGE',
    'QUOTE_READ',
    'QUOTE_WRITE',
    'QUOTE_APPROVE',
    'QUOTE_EXPORT_PDF',
    'BOQ_READ',
    'BOQ_WRITE',
    'BOQ_IMPORT',
    'CONTRACT_READ',
    'CONTRACT_WRITE',
    'CONTRACT_APPROVE',
    'CONTRACT_EXPORT_PDF',
    'INVOICE_READ',
    'INVOICE_WRITE',
    'INVOICE_SEND',
    'INVOICE_EXPORT_PDF',
    'PAYMENT_RECORD',
    'SUPPLIER_READ',
    'SUPPLIER_WRITE',
    'SUBCONTRACT_READ',
    'SUBCONTRACT_WRITE',
    'SUBCONTRACT_APPROVE',
    'PM_UPDATE_READ',
    'PM_UPDATE_WRITE',
    'COMMS_READ',
    'COMMS_WRITE',
    'PNL_READ',
    'AUDIT_READ'
);

-- CreateEnum
CREATE TYPE "ProjectCommercialStatus" AS ENUM (
    'LEAD',
    'QUOTING',
    'CONTRACTED',
    'IN_PROGRESS',
    'DEFECTS',
    'COMPLETED',
    'CANCELLED'
);

-- CreateEnum
CREATE TYPE "ProjectMilestoneStatus" AS ENUM (
    'PLANNED',
    'IN_PROGRESS',
    'DONE',
    'BLOCKED'
);

-- CreateEnum
CREATE TYPE "ProjectTimelineItemType" AS ENUM (
    'NOTE',
    'MILESTONE',
    'STATUS_CHANGE',
    'QUOTATION',
    'CONTRACT',
    'INVOICE',
    'PAYMENT',
    'VARIATION_ORDER'
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" "Permission"[] NOT NULL DEFAULT ARRAY[]::"Permission"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCommercialProfile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ProjectCommercialStatus" NOT NULL DEFAULT 'LEAD',
    "startDate" TIMESTAMP(3),
    "targetEndDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'SGD',
    "gstRate" DECIMAL(5,4) NOT NULL DEFAULT 0.09,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCommercialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTimelineItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ProjectTimelineItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTimelineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "actorUserId" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "note" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityRevision_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_status_idx" ON "User"("status");

CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
CREATE INDEX "ProjectMember_roleId_idx" ON "ProjectMember"("roleId");

CREATE UNIQUE INDEX "ProjectCommercialProfile_projectId_key" ON "ProjectCommercialProfile"("projectId");
CREATE INDEX "ProjectCommercialProfile_status_idx" ON "ProjectCommercialProfile"("status");

CREATE INDEX "ProjectMilestone_projectId_idx" ON "ProjectMilestone"("projectId");
CREATE INDEX "ProjectMilestone_status_idx" ON "ProjectMilestone"("status");
CREATE INDEX "ProjectMilestone_sortOrder_idx" ON "ProjectMilestone"("sortOrder");

CREATE INDEX "ProjectTimelineItem_projectId_idx" ON "ProjectTimelineItem"("projectId");
CREATE INDEX "ProjectTimelineItem_type_idx" ON "ProjectTimelineItem"("type");
CREATE INDEX "ProjectTimelineItem_occurredAt_idx" ON "ProjectTimelineItem"("occurredAt");
CREATE INDEX "ProjectTimelineItem_createdById_idx" ON "ProjectTimelineItem"("createdById");

CREATE INDEX "AuditEvent_projectId_idx" ON "AuditEvent"("projectId");
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");
CREATE INDEX "AuditEvent_module_idx" ON "AuditEvent"("module");
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

CREATE UNIQUE INDEX "EntityRevision_entityType_entityId_revision_key" ON "EntityRevision"("entityType", "entityId", "revision");
CREATE INDEX "EntityRevision_projectId_idx" ON "EntityRevision"("projectId");
CREATE INDEX "EntityRevision_actorUserId_idx" ON "EntityRevision"("actorUserId");
CREATE INDEX "EntityRevision_createdAt_idx" ON "EntityRevision"("createdAt");

-- Foreign Keys
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectCommercialProfile" ADD CONSTRAINT "ProjectCommercialProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTimelineItem" ADD CONSTRAINT "ProjectTimelineItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTimelineItem" ADD CONSTRAINT "ProjectTimelineItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EntityRevision" ADD CONSTRAINT "EntityRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntityRevision" ADD CONSTRAINT "EntityRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
