"use server";

import { Permission, Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { computeProjectPnlMetrics } from "@/lib/pnl/service";
import { createVariationDraft, approveVariationInternal, createVariationInvoice } from "@/lib/variation-orders/service";

const ledgerSchema = z.object({
  projectId: z.string().min(1),
  sourceType: z.string().min(1),
  sourceId: z.string().optional().or(z.literal("")),
  description: z.string().min(1),
  category: z.string().min(1),
  costType: z.string().min(1),
  amount: z.coerce.number().min(0),
  gstAmount: z.coerce.number().min(0).default(0),
  status: z.string().min(1).default("POSTED"),
  incurredDate: z.string().min(1),
});

const snapshotSchema = z.object({
  projectId: z.string().min(1),
});

const createVoSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  quotationId: z.string().optional().or(z.literal("")),
  unit: z.string().default("lot"),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0),
});

const approveVoSchema = z.object({
  projectId: z.string().min(1),
  variationOrderId: z.string().min(1),
});

const invoiceVoSchema = z.object({
  projectId: z.string().min(1),
  variationOrderId: z.string().min(1),
});

function roundCurrency(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function toRiskLevel(metrics: Awaited<ReturnType<typeof computeProjectPnlMetrics>>): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const severeLeakage = metrics.leakageSignals.some((s) => s.severity === "CRITICAL");
  const highLeakage = metrics.leakageSignals.some((s) => s.severity === "HIGH");
  const marginLow = metrics.projectedMarginPercent < 10;

  if (severeLeakage || metrics.overdueInvoiceOutstanding > 5000 || metrics.unpaidSupplierBillOutstanding > 5000) return "CRITICAL";
  if (highLeakage || marginLow || metrics.overdueInvoiceOutstanding > 0 || metrics.unpaidSupplierBillOutstanding > 0) return "HIGH";
  if (metrics.leakageSignals.length > 0 || metrics.projectedMarginPercent < 15) return "MEDIUM";
  return "LOW";
}

function buildRiskSummary(metrics: Awaited<ReturnType<typeof computeProjectPnlMetrics>>): string {
  const flags: string[] = [];

  if (metrics.projectedMarginPercent < 12) flags.push("Margin below target");
  if (metrics.billsExceedingPo.length > 0) flags.push("PO cost exceeded by supplier bills");
  if (metrics.approvedVariationRevenue <= 0 && metrics.actualCost > metrics.estimatedCost) flags.push("Possible missing variation order for scope drift");
  if (metrics.approvedVariationRevenue > 0 && metrics.invoicedRevenueNet < metrics.approvedVariationRevenue * 0.6) flags.push("Approved variation work appears under-billed");
  if (metrics.overdueInvoiceOutstanding > 0) flags.push("Overdue payment detected");
  if (metrics.unpaidSupplierBillOutstanding > 0) flags.push("Unpaid supplier risk detected");

  if (flags.length === 0) {
    return "Risk check healthy: margin, billing, supplier obligations, and variation controls are within acceptable range.";
  }

  return `Risk flags: ${flags.join("; ")}.`;
}

export async function createProjectCostLedgerEntry(formData: FormData) {
  const parsed = ledgerSchema.safeParse({
    projectId: formData.get("projectId"),
    sourceType: formData.get("sourceType"),
    sourceId: formData.get("sourceId")?.toString() ?? "",
    description: formData.get("description"),
    category: formData.get("category"),
    costType: formData.get("costType"),
    amount: formData.get("amount"),
    gstAmount: formData.get("gstAmount") ?? 0,
    status: formData.get("status") ?? "POSTED",
    incurredDate: formData.get("incurredDate"),
  });
  if (!parsed.success) throw new Error("Invalid cost ledger input.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId: parsed.data.projectId });

  const totalAmount = roundCurrency(parsed.data.amount + parsed.data.gstAmount);

  await prisma.projectCostLedger.create({
    data: {
      projectId: parsed.data.projectId,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId || null,
      description: parsed.data.description,
      category: parsed.data.category,
      costType: parsed.data.costType,
      amount: new Prisma.Decimal(roundCurrency(parsed.data.amount)),
      gstAmount: new Prisma.Decimal(roundCurrency(parsed.data.gstAmount)),
      totalAmount: new Prisma.Decimal(totalAmount),
      status: parsed.data.status,
      incurredDate: new Date(parsed.data.incurredDate),
    },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/cost-ledger`);
  revalidatePath(`/projects/${parsed.data.projectId}/profitability`);
}

export async function generateProjectProfitSnapshot(formData: FormData) {
  const parsed = snapshotSchema.safeParse({
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) throw new Error("Invalid project id.");

  await requirePermission({ permission: Permission.PNL_READ, projectId: parsed.data.projectId });

  const metrics = await computeProjectPnlMetrics(parsed.data.projectId);
  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { revisedContractValue: true, contractValue: true } });
  if (!project) throw new Error("Project not found.");

  const contractValue = Number(project.revisedContractValue) > 0 ? Number(project.revisedContractValue) : Number(project.contractValue);
  const totalRevenue = roundCurrency(contractValue + metrics.approvedVariationRevenue);
  const projectedCost = roundCurrency(Math.max(metrics.estimatedCost, metrics.committedCost, metrics.actualCost));
  const grossProfit = roundCurrency(totalRevenue - projectedCost);
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const riskLevel = toRiskLevel(metrics);
  const aiRiskSummary = buildRiskSummary(metrics);

  await prisma.projectProfitSnapshot.create({
    data: {
      projectId: parsed.data.projectId,
      contractValue: new Prisma.Decimal(roundCurrency(contractValue)),
      approvedVariationValue: new Prisma.Decimal(metrics.approvedVariationRevenue),
      totalRevenue: new Prisma.Decimal(totalRevenue),
      committedCost: new Prisma.Decimal(metrics.committedCost),
      actualCost: new Prisma.Decimal(metrics.actualCost),
      projectedCost: new Prisma.Decimal(projectedCost),
      grossProfit: new Prisma.Decimal(grossProfit),
      grossMargin: new Prisma.Decimal(roundCurrency(grossMargin)),
      amountInvoiced: new Prisma.Decimal(metrics.invoicedRevenueNet),
      amountPaid: new Prisma.Decimal(metrics.collectedRevenue),
      outstandingAmount: new Prisma.Decimal(metrics.outstandingReceivables),
      riskLevel,
      aiRiskSummary,
    },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/profitability`);
}

export async function createVariationOrder(formData: FormData) {
  const parsed = createVoSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    reason: formData.get("reason")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    quotationId: formData.get("quotationId")?.toString() ?? "",
    unit: formData.get("unit")?.toString() ?? "lot",
    quantity: formData.get("quantity"),
    unitPrice: formData.get("unitPrice"),
    costPrice: formData.get("costPrice"),
  });
  if (!parsed.success) throw new Error("Invalid variation order input.");

  await requirePermission({ permission: Permission.QUOTE_WRITE, projectId: parsed.data.projectId });

  const vo = await createVariationDraft({
    projectId: parsed.data.projectId,
    title: parsed.data.title,
    reason: parsed.data.reason || null,
    description: parsed.data.description || null,
    quotationId: parsed.data.quotationId || null,
    items: [
      {
        description: parsed.data.title,
        unit: parsed.data.unit,
        quantity: parsed.data.quantity,
        unitPrice: parsed.data.unitPrice,
        costPrice: parsed.data.costPrice,
        sortOrder: 0,
      },
    ],
  });

  revalidatePath(`/projects/${parsed.data.projectId}/variation-orders`);
  revalidatePath(`/projects/${parsed.data.projectId}/variation-orders/${vo.id}`);
  redirect(`/projects/${parsed.data.projectId}/variation-orders/${vo.id}`);
}

export async function approveVariationOrder(formData: FormData) {
  const parsed = approveVoSchema.safeParse({
    projectId: formData.get("projectId"),
    variationOrderId: formData.get("variationOrderId"),
  });
  if (!parsed.success) throw new Error("Invalid approve payload.");

  await requirePermission({ permission: Permission.QUOTE_APPROVE, projectId: parsed.data.projectId });

  await approveVariationInternal({
    projectId: parsed.data.projectId,
    variationId: parsed.data.variationOrderId,
  });

  await prisma.variationOrder.update({
    where: { id: parsed.data.variationOrderId },
    data: { clientApprovedAt: new Date() },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/variation-orders`);
  revalidatePath(`/projects/${parsed.data.projectId}/variation-orders/${parsed.data.variationOrderId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/profitability`);
}

export async function createInvoiceFromVariationOrder(formData: FormData) {
  const parsed = invoiceVoSchema.safeParse({
    projectId: formData.get("projectId"),
    variationOrderId: formData.get("variationOrderId"),
  });
  if (!parsed.success) throw new Error("Invalid invoice payload.");

  await requirePermission({ permission: Permission.INVOICE_WRITE, projectId: parsed.data.projectId });

  const invoice = await createVariationInvoice({
    projectId: parsed.data.projectId,
    variationId: parsed.data.variationOrderId,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/variation-orders`);
  revalidatePath(`/projects/${parsed.data.projectId}/variation-orders/${parsed.data.variationOrderId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/invoices`);
  redirect(`/projects/${parsed.data.projectId}/invoices/${invoice.id}`);
}
