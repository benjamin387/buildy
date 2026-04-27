-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('SUPPLIER', 'SUBCONTRACTOR');

-- CreateEnum
CREATE TYPE "VendorOnboardingStatus" AS ENUM ('INVITED', 'PENDING', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ComplianceDocType" AS ENUM ('INSURANCE', 'WARRANTY', 'LICENSE', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "SubcontractStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'ACTIVE', 'COMPLETED', 'TERMINATED');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "type" "VendorType" NOT NULL,
    "status" "VendorOnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorComplianceDocument" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "docType" "ComplianceDocType" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcontract" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "SubcontractStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "scopeOfWork" TEXT,
    "contractSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "warrantyTerms" TEXT,
    "variationPolicy" TEXT,
    "defectsPolicy" TEXT,
    "insurancePolicy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subcontract_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "Vendor_type_idx" ON "Vendor"("type");
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");
CREATE INDEX "Vendor_name_idx" ON "Vendor"("name");
CREATE INDEX "Vendor_email_idx" ON "Vendor"("email");

CREATE INDEX "VendorComplianceDocument_vendorId_idx" ON "VendorComplianceDocument"("vendorId");
CREATE INDEX "VendorComplianceDocument_docType_idx" ON "VendorComplianceDocument"("docType");
CREATE INDEX "VendorComplianceDocument_expiryDate_idx" ON "VendorComplianceDocument"("expiryDate");

CREATE INDEX "Subcontract_projectId_idx" ON "Subcontract"("projectId");
CREATE INDEX "Subcontract_vendorId_idx" ON "Subcontract"("vendorId");
CREATE INDEX "Subcontract_status_idx" ON "Subcontract"("status");

-- Foreign Keys
ALTER TABLE "VendorComplianceDocument" ADD CONSTRAINT "VendorComplianceDocument_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subcontract" ADD CONSTRAINT "Subcontract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subcontract" ADD CONSTRAINT "Subcontract_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

