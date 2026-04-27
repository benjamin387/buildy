"use server";

import { Permission, Prisma, VendorType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { recomputeProjectCostRollups } from "@/lib/suppliers/service";
import { refreshProjectPnlAlerts } from "@/lib/pnl/alerts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function getGstRate(projectId: string): Promise<number> {
  const profile = await prisma.projectCommercialProfile.findUnique({
    where: { projectId },
    select: { gstRate: true },
  });
  return profile?.gstRate ? Number(profile.gstRate) : 0.09;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const createVendorSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(VendorType),
  email: z.string().email().optional().or(z.literal("")).default(""),
  phone: z.string().optional().or(z.literal("")).default(""),
  contactPerson: z.string().optional().or(z.literal("")).default(""),
});

export async function createVendor(formData: FormData) {
  await requirePermission({ permission: Permission.SUPPLIER_WRITE });

  const parsed = createVendorSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    contactPerson: formData.get("contactPerson"),
  });
  if (!parsed.success) throw new Error("Invalid vendor input.");

  const vendor = await prisma.vendor.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      status: "PENDING",
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      contactPerson: parsed.data.contactPerson || null,
    },
  });

  await auditLog({
    module: "vendor",
    action: "create",
    entityType: "Vendor",
    entityId: vendor.id,
    metadata: { name: vendor.name, type: vendor.type },
  });

  revalidatePath("/vendors");
}

const createSubcontractSchema = z.object({
  projectId: z.string().min(1),
  vendorId: z.string().min(1),
  title: z.string().min(1),
  scopeOfWork: z.string().optional().or(z.literal("")).default(""),
  contractSubtotal: z.coerce.number().min(0),
});

export async function createSubcontract(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createSubcontractSchema.safeParse({
    projectId,
    vendorId: formData.get("vendorId"),
    title: formData.get("title"),
    scopeOfWork: formData.get("scopeOfWork"),
    contractSubtotal: formData.get("contractSubtotal"),
  });
  if (!parsed.success) throw new Error("Invalid subcontract input.");

  const { userId } = await requirePermission({
    permission: Permission.SUBCONTRACT_WRITE,
    projectId,
  });

  const supplier = await prisma.vendor.findUnique({ where: { id: parsed.data.vendorId } });
  if (!supplier) throw new Error("Supplier not found.");
  if (supplier.type !== VendorType.SUBCONTRACTOR && supplier.type !== VendorType.BOTH) {
    throw new Error("Selected vendor is not a subcontractor.");
  }

  const gstRate = await getGstRate(projectId);
  const subtotal = parsed.data.contractSubtotal;
  const gstAmount = supplier.gstRegistered ? roundCurrency(subtotal * gstRate) : 0;
  const totalAmount = roundCurrency(subtotal + gstAmount);

  const subcontract = await prisma.subcontract.create({
    data: {
      projectId,
      supplierId: parsed.data.vendorId,
      title: parsed.data.title,
      scopeOfWork: parsed.data.scopeOfWork || null,
      status: "DRAFT",
      contractSubtotal: new Prisma.Decimal(roundCurrency(subtotal)),
      gstAmount: new Prisma.Decimal(roundCurrency(gstAmount)),
      totalAmount: new Prisma.Decimal(roundCurrency(totalAmount)),
      paymentTerms:
        "Payment is subject to inspection, acceptance, and agreed milestones. Retention may apply where appropriate.",
      warrantyTerms:
        "Subcontractor warrants workmanship and materials for the agreed warranty period. Defects to be rectified upon notice.",
      variationPolicy:
        "No variations without written instruction. Variation price and schedule impact to be agreed before execution.",
      defectsPolicy:
        "Defects must be rectified within a reasonable timeframe. Misuse and third-party damage excluded.",
      insurancePolicy:
        "Subcontractor to maintain required insurances (as applicable) and provide evidence upon request.",
    },
  });

  await recomputeProjectCostRollups(projectId);
  await refreshProjectPnlAlerts(projectId);

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `Subcontract drafted: ${subcontract.title}`,
      createdById: userId,
      metadata: { subcontractId: subcontract.id, supplierId: subcontract.supplierId },
    },
  });

  await auditLog({
    module: "subcontract",
    action: "create",
    actorUserId: userId,
    projectId,
    entityType: "Subcontract",
    entityId: subcontract.id,
    metadata: { title: subcontract.title, supplierId: subcontract.supplierId },
  });

  await createRevision({
    entityType: "Subcontract",
    entityId: subcontract.id,
    projectId,
    actorUserId: userId,
    note: "Draft created",
    data: {
      subcontractId: subcontract.id,
      title: subcontract.title,
      subtotal,
      gstRate,
      totalAmount,
    },
  });

  revalidatePath(`/projects/${projectId}/suppliers`);
  redirect(`/projects/${projectId}/suppliers/subcontracts/${subcontract.id}`);
}
