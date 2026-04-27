"use server";

import { Permission, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { generateVariationOrderReference } from "@/lib/variation-orders/reference";
import { auditLog, createRevision } from "@/lib/audit";
import { recomputeProjectCostRollups } from "@/lib/suppliers/service";
import { refreshProjectPnlAlerts } from "@/lib/pnl/alerts";
import { revalidatePath } from "next/cache";

async function getGstRate(projectId: string): Promise<number> {
  const profile = await prisma.projectCommercialProfile.findUnique({
    where: { projectId },
    select: { gstRate: true },
  });
  return profile?.gstRate ? Number(profile.gstRate) : 0.09;
}

const createVoSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().or(z.literal("")).default(""),
  subtotal: z.coerce.number().min(0),
  costSubtotal: z.coerce.number().min(0),
});

export async function createVariationOrder(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createVoSchema.safeParse({
    projectId,
    title: formData.get("title"),
    description: formData.get("description"),
    subtotal: formData.get("subtotal"),
    costSubtotal: formData.get("costSubtotal"),
  });
  if (!parsed.success) throw new Error("Invalid VO input.");

  const { userId } = await requirePermission({
    permission: Permission.QUOTE_WRITE,
    projectId,
  });

  const gstRate = await getGstRate(projectId);
  const gstAmount = parsed.data.subtotal * gstRate;
  const totalAmount = parsed.data.subtotal + gstAmount;
  const profitAmount = parsed.data.subtotal - parsed.data.costSubtotal;
  const marginPercent = parsed.data.subtotal > 0 ? (profitAmount / parsed.data.subtotal) * 100 : 0;

  const vo = await prisma.variationOrder.create({
    data: {
      projectId,
      referenceNumber: generateVariationOrderReference(new Date()),
      status: "DRAFT",
      title: parsed.data.title,
      description: parsed.data.description || null,
      costImpact: new Prisma.Decimal(parsed.data.subtotal),
      subtotal: new Prisma.Decimal(parsed.data.subtotal),
      gstAmount: new Prisma.Decimal(gstAmount),
      totalAmount: new Prisma.Decimal(totalAmount),
      costSubtotal: new Prisma.Decimal(parsed.data.costSubtotal),
      lineItems: {
        create: [
          {
            description: parsed.data.title,
            unit: "lot",
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(parsed.data.subtotal),
            totalPrice: new Prisma.Decimal(parsed.data.subtotal),
            costPrice: new Prisma.Decimal(parsed.data.costSubtotal),
            totalCost: new Prisma.Decimal(parsed.data.costSubtotal),
            profitAmount: new Prisma.Decimal(profitAmount),
            marginPercent: new Prisma.Decimal(marginPercent),
            sortOrder: 0,
          },
        ],
      },
    },
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "VARIATION_ORDER",
      title: `VO drafted: ${vo.referenceNumber}`,
      createdById: userId,
      metadata: { variationOrderId: vo.id, referenceNumber: vo.referenceNumber },
    },
  });

  await auditLog({
    module: "vo",
    action: "create",
    actorUserId: userId,
    projectId,
    entityType: "VariationOrder",
    entityId: vo.id,
    metadata: { referenceNumber: vo.referenceNumber, subtotal: parsed.data.subtotal },
  });

  await createRevision({
    entityType: "VariationOrder",
    entityId: vo.id,
    projectId,
    actorUserId: userId,
    note: "Draft created",
    data: {
      referenceNumber: vo.referenceNumber,
      subtotal: parsed.data.subtotal,
      gstRate,
      totalAmount,
      costSubtotal: parsed.data.costSubtotal,
    },
  });

  await refreshProjectPnlAlerts(projectId);
  revalidatePath(`/projects/${projectId}/pnl`);
  revalidatePath(`/projects/${projectId}`);
}

const approveVoSchema = z.object({
  projectId: z.string().min(1),
  variationOrderId: z.string().min(1),
});

export async function approveVariationOrder(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = approveVoSchema.safeParse({
    projectId,
    variationOrderId: formData.get("variationOrderId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({
    permission: Permission.QUOTE_APPROVE,
    projectId,
  });

  const vo = await prisma.variationOrder.findUnique({ where: { id: parsed.data.variationOrderId } });
  if (!vo || vo.projectId !== projectId) throw new Error("Not found.");

  const updated = await prisma.variationOrder.update({
    where: { id: vo.id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      rejectedAt: null,
      submittedAt: vo.submittedAt ?? new Date(),
      costImpact: vo.costImpact.gt(0) ? vo.costImpact : vo.subtotal,
    },
  });

  // Best-effort: refresh revised contract value = base contract value + approved/invoiced VO cost impact.
  const [agg, project] = await Promise.all([
    prisma.variationOrder.aggregate({
      where: { projectId, status: { in: ["APPROVED", "INVOICED"] } },
      _sum: { costImpact: true },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { contractValue: true } }),
  ]);
  if (project) {
    const revised = Number(project.contractValue) + Number(agg._sum.costImpact ?? 0);
    await prisma.project.update({ where: { id: projectId }, data: { revisedContractValue: new Prisma.Decimal(revised) } });
  }

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "VARIATION_ORDER",
      title: `VO approved: ${updated.referenceNumber}`,
      createdById: userId,
      metadata: { variationOrderId: updated.id, referenceNumber: updated.referenceNumber },
    },
  });

  await auditLog({
    module: "vo",
    action: "approve",
    actorUserId: userId,
    projectId,
    entityType: "VariationOrder",
    entityId: updated.id,
    metadata: { referenceNumber: updated.referenceNumber },
  });

  await createRevision({
    entityType: "VariationOrder",
    entityId: updated.id,
    projectId,
    actorUserId: userId,
    note: "Approved",
    data: { status: updated.status },
  });

  await refreshProjectPnlAlerts(projectId);
  revalidatePath(`/projects/${projectId}/pnl`);
  revalidatePath(`/projects/${projectId}`);
}

const createActualCostSchema = z.object({
  projectId: z.string().min(1),
  vendorId: z.string().optional().or(z.literal("")).default(""),
  category: z.enum(["MATERIAL", "LABOR", "SUBCONTRACT", "PERMIT", "LOGISTICS", "OTHER"]).default("OTHER"),
  occurredAt: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number().min(0),
});

export async function createActualCost(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createActualCostSchema.safeParse({
    projectId,
    vendorId: formData.get("vendorId"),
    category: formData.get("category"),
    occurredAt: formData.get("occurredAt"),
    description: formData.get("description"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) throw new Error("Invalid cost input.");

  const { userId } = await requirePermission({
    permission: Permission.PROJECT_WRITE,
    projectId,
  });

  const entry = await prisma.actualCostEntry.create({
    data: {
      projectId,
      vendorId: parsed.data.vendorId || null,
      category: parsed.data.category,
      occurredAt: new Date(parsed.data.occurredAt),
      description: parsed.data.description,
      amount: new Prisma.Decimal(parsed.data.amount),
    },
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `Actual cost: ${parsed.data.category}`,
      description: entry.description,
      createdById: userId,
      metadata: { actualCostEntryId: entry.id, amount: parsed.data.amount },
    },
  });

  await auditLog({
    module: "pnl",
    action: "record_actual_cost",
    actorUserId: userId,
    projectId,
    entityType: "ActualCostEntry",
    entityId: entry.id,
    metadata: { category: entry.category, amount: parsed.data.amount },
  });

  await recomputeProjectCostRollups(projectId);
  await refreshProjectPnlAlerts(projectId);
  revalidatePath(`/projects/${projectId}/pnl`);
}

const resolveAlertSchema = z.object({
  projectId: z.string().min(1),
  alertId: z.string().min(1),
});

export async function resolvePnLAlertAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = resolveAlertSchema.safeParse({
    projectId,
    alertId: formData.get("alertId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({
    permission: Permission.PNL_READ,
    projectId,
  });

  const alert = await prisma.pnLAlert.findUnique({ where: { id: parsed.data.alertId } });
  if (!alert || alert.projectId !== projectId) throw new Error("Alert not found.");

  await prisma.pnLAlert.update({
    where: { id: alert.id },
    data: { isResolved: true, resolvedAt: new Date() },
  });

  await auditLog({
    module: "pnl_alert",
    action: "resolve",
    actorUserId: userId,
    projectId,
    entityType: "PnLAlert",
    entityId: alert.id,
    metadata: { type: alert.type, severity: alert.severity },
  });

  revalidatePath(`/projects/${projectId}/pnl`);
}

const refreshAlertsSchema = z.object({
  projectId: z.string().min(1),
});

export async function refreshPnLAlertsAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = refreshAlertsSchema.safeParse({ projectId });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PNL_READ, projectId });
  await refreshProjectPnlAlerts(projectId);
  revalidatePath(`/projects/${projectId}/pnl`);
}
