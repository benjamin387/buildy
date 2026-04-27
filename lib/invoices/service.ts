import { InvoiceStatus, InvoiceType, PaymentScheduleStatus, PaymentScheduleType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeInvoiceTotals, computeOutstandingAmount, toDecimal } from "@/lib/invoices/engine";
import { generateInvoiceNumber } from "@/lib/invoices/invoice-number";
import { refreshProjectPnlAlerts } from "@/lib/pnl/alerts";
import { refreshOverdueCollectionCases, syncCollectionCaseForInvoice } from "@/lib/collections/service";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getProjectGstRate(projectId: string): Promise<number> {
  const profile = await prisma.projectCommercialProfile.findUnique({
    where: { projectId },
    select: { gstRate: true },
  });
  return profile?.gstRate ? Number(profile.gstRate) : 0.09;
}

export function canTransitionInvoiceStatus(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return true;
  if (from === "VOID") return false;
  if (from === "PAID") return false;

  const order: InvoiceStatus[] = ["DRAFT", "SENT", "VIEWED", "PARTIALLY_PAID", "PAID"];
  const fromIndex = order.indexOf(from);
  const toIndex = order.indexOf(to);
  if (fromIndex !== -1 && toIndex !== -1) return toIndex >= fromIndex && toIndex - fromIndex <= 2;

  // Allow moving into OVERDUE from SENT/VIEWED/PARTIALLY_PAID.
  if (to === "OVERDUE") return ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(from);

  return false;
}

export async function listInvoicesByProject(projectId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { projectId },
    include: {
      receipts: true,
      paymentSchedules: true,
    },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
  });

  const now = Date.now();
  const enriched = invoices.map((inv) => {
    const receiptsTotal = inv.receipts.reduce((sum, r) => sum + Number(r.amount), 0);
    const outstanding = Number(inv.outstandingAmount);
    const isOverdue = !!inv.dueDate && inv.dueDate.getTime() < now && outstanding > 0 && inv.status !== "VOID";
    return {
      ...inv,
      receiptsTotal,
      isOverdue,
    };
  });

  return enriched;
}

export async function getInvoiceById(params: { projectId: string; invoiceId: string }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: {
      project: { include: { client: true, commercialProfile: true } },
      contract: true,
      quotation: true,
      variationOrder: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      receipts: { orderBy: { paymentDate: "desc" } },
      paymentSchedules: { orderBy: { sortOrder: "asc" } },
      creditNotes: { orderBy: { issueDate: "desc" } },
      paymentScheduleAllocations: {
        include: { paymentSchedule: true },
      },
    },
  });
  if (!invoice || invoice.projectId !== params.projectId) return null;
  return invoice;
}

export async function createManualInvoice(params: {
  projectId: string;
  contractId?: string | null;
  quotationId?: string | null;
  variationOrderId?: string | null;
  progressClaimId?: string | null;
  invoiceType: InvoiceType;
  issueDate: Date;
  dueDate?: Date | null;
  discountAmount: number;
  title?: string | null;
  notes?: string | null;
  lines: Array<{
    itemId?: string | null;
    sku?: string | null;
    description: string;
    unit?: string | null;
    quantity: number;
    unitPrice: number;
    sortOrder: number;
  }>;
}) {
  const gstRate = await getProjectGstRate(params.projectId);
  const computed = computeInvoiceTotals({
    lines: params.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
    discountAmount: params.discountAmount,
    gstRate,
  });

  const invoiceDate = params.issueDate;
  const invoiceNumber = generateInvoiceNumber(invoiceDate);

  const invoice = await prisma.invoice.create({
    data: {
      projectId: params.projectId,
      contractId: params.contractId ?? null,
      quotationId: params.quotationId ?? null,
      variationOrderId: params.variationOrderId ?? null,
      progressClaimId: params.progressClaimId ?? null,
      invoiceNumber,
      invoiceType: params.invoiceType,
      status: "DRAFT",
      issueDate: invoiceDate,
      dueDate: params.dueDate ?? null,
      subtotal: toDecimal(computed.subtotal),
      discountAmount: toDecimal(computed.discountAmount),
      taxAmount: toDecimal(computed.taxAmount),
      totalAmount: toDecimal(computed.totalAmount),
      outstandingAmount: toDecimal(computed.totalAmount),
      title: params.title ?? null,
      notes: params.notes ?? null,
      lineItems: {
        create: params.lines.map((l) => ({
          itemId: l.itemId ?? null,
          sku: l.sku ?? null,
          description: l.description,
          unit: l.unit ?? "lot",
          quantity: new Prisma.Decimal(roundCurrency(l.quantity)),
          unitPrice: toDecimal(l.unitPrice),
          lineAmount: toDecimal(roundCurrency(l.quantity * l.unitPrice)),
          sortOrder: l.sortOrder,
        })),
      },
    },
    include: { lineItems: true },
  });

  await refreshProjectPnlAlerts(params.projectId);
  await syncCollectionCaseForInvoice({ projectId: params.projectId, invoiceId: invoice.id });
  return invoice;
}

export async function createInvoiceFromPaymentSchedule(params: {
  projectId: string;
  paymentScheduleId: string;
  issueDate: Date;
  dueDate?: Date | null;
  invoiceType?: InvoiceType;
}) {
  const schedule = await prisma.paymentSchedule.findUnique({ where: { id: params.paymentScheduleId } });
  if (!schedule || schedule.projectId !== params.projectId) throw new Error("Payment schedule not found.");

  // If this is contract-derived billing, only allow when the contract is signed.
  if (schedule.contractId) {
    const contract = await prisma.contract.findUnique({ where: { id: schedule.contractId } });
    if (!contract || contract.projectId !== params.projectId) throw new Error("Contract not found.");
    if (contract.status !== "SIGNED") throw new Error("Contract must be signed to invoice against contract milestones.");
  }

  const scheduledAmount = Number(schedule.scheduledAmount);
  const billedAmount = Number(schedule.billedAmount);
  const remaining = Math.max(roundCurrency(scheduledAmount - billedAmount), 0);
  if (remaining <= 0) throw new Error("This schedule stage is fully billed.");

  const gstRate = await getProjectGstRate(params.projectId);
  const computed = computeInvoiceTotals({
    lines: [{ quantity: 1, unitPrice: remaining }],
    discountAmount: 0,
    gstRate,
  });

  const invoiceNumber = generateInvoiceNumber(params.issueDate);

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        projectId: params.projectId,
        contractId: schedule.contractId ?? null,
        quotationId: schedule.quotationId ?? null,
        invoiceNumber,
        invoiceType: params.invoiceType ?? "PROGRESS",
        status: "DRAFT",
        issueDate: params.issueDate,
        dueDate: params.dueDate ?? null,
        subtotal: toDecimal(computed.subtotal),
        discountAmount: toDecimal(0),
        taxAmount: toDecimal(computed.taxAmount),
        totalAmount: toDecimal(computed.totalAmount),
        outstandingAmount: toDecimal(computed.totalAmount),
        title: schedule.label,
        lineItems: {
          create: [
            {
              description: schedule.label,
              unit: "lot",
              quantity: new Prisma.Decimal(1),
              unitPrice: toDecimal(remaining),
              lineAmount: toDecimal(remaining),
              sortOrder: 0,
            },
          ],
        },
        paymentSchedules: { connect: { id: schedule.id } },
        paymentScheduleAllocations: {
          create: [{ paymentScheduleId: schedule.id, allocatedSubtotal: toDecimal(remaining) }],
        },
      },
    });

    const nextBilled = roundCurrency(billedAmount + remaining);
    const paidAmount = Number(schedule.paidAmount);
    const status: PaymentScheduleStatus =
      paidAmount >= scheduledAmount
        ? "PAID"
        : nextBilled >= scheduledAmount
          ? paidAmount > 0
            ? "PARTIALLY_PAID"
            : "BILLED"
          : "BILLED";

    await tx.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        billedAmount: toDecimal(nextBilled),
        status,
        invoiceId: schedule.invoiceId ?? created.id, // keep legacy pointer to first invoice
      },
    });

    return created;
  });

  await refreshProjectPnlAlerts(params.projectId);
  await syncCollectionCaseForInvoice({ projectId: params.projectId, invoiceId: invoice.id });
  return invoice;
}

export async function updateInvoiceDraft(params: {
  projectId: string;
  invoiceId: string;
  dueDate?: Date | null;
  discountAmount: number;
  title?: string | null;
  notes?: string | null;
  lines: Array<{
    id?: string | null;
    itemId?: string | null;
    sku?: string | null;
    description: string;
    unit?: string | null;
    quantity: number;
    unitPrice: number;
    sortOrder: number;
  }>;
}) {
  const existing = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { lineItems: true, receipts: true },
  });
  if (!existing || existing.projectId !== params.projectId) throw new Error("Invoice not found.");
  if (existing.status !== "DRAFT") throw new Error("Only draft invoices can be edited.");

  const gstRate = await getProjectGstRate(params.projectId);
  const computed = computeInvoiceTotals({
    lines: params.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
    discountAmount: params.discountAmount,
    gstRate,
  });

  const receiptsTotal = existing.receipts.reduce((sum, r) => sum + Number(r.amount), 0);
  const outstanding = computeOutstandingAmount(computed.totalAmount, receiptsTotal);

  const existingLineIds = new Set(existing.lineItems.map((l) => l.id));
  const keepLineIds = new Set(params.lines.map((l) => l.id).filter((id): id is string => !!id));
  const deleteLineIds = Array.from(existingLineIds).filter((id) => !keepLineIds.has(id));

  const updated = await prisma.$transaction(async (tx) => {
    if (deleteLineIds.length > 0) {
      await tx.invoiceLine.deleteMany({ where: { id: { in: deleteLineIds } } });
    }

    for (const line of params.lines) {
      const lineAmount = roundCurrency(line.quantity * line.unitPrice);
      if (line.id && existingLineIds.has(line.id)) {
        await tx.invoiceLine.update({
          where: { id: line.id },
          data: {
            itemId: line.itemId ?? null,
            sku: line.sku ?? null,
            description: line.description,
            unit: line.unit ?? "lot",
            quantity: new Prisma.Decimal(roundCurrency(line.quantity)),
            unitPrice: toDecimal(line.unitPrice),
            lineAmount: toDecimal(lineAmount),
            sortOrder: line.sortOrder,
          },
        });
      } else {
        await tx.invoiceLine.create({
          data: {
            invoiceId: existing.id,
            itemId: line.itemId ?? null,
            sku: line.sku ?? null,
            description: line.description,
            unit: line.unit ?? "lot",
            quantity: new Prisma.Decimal(roundCurrency(line.quantity)),
            unitPrice: toDecimal(line.unitPrice),
            lineAmount: toDecimal(lineAmount),
            sortOrder: line.sortOrder,
          },
        });
      }
    }

    const inv = await tx.invoice.update({
      where: { id: existing.id },
      data: {
        dueDate: params.dueDate ?? null,
        discountAmount: toDecimal(computed.discountAmount),
        subtotal: toDecimal(computed.subtotal),
        taxAmount: toDecimal(computed.taxAmount),
        totalAmount: toDecimal(computed.totalAmount),
        outstandingAmount: toDecimal(outstanding),
        title: params.title ?? null,
        notes: params.notes ?? null,
      },
    });

    return inv;
  });

  await syncCollectionCaseForInvoice({ projectId: params.projectId, invoiceId: updated.id });
  return updated;
}

export async function setInvoiceStatus(params: {
  projectId: string;
  invoiceId: string;
  status: InvoiceStatus;
}) {
  const invoice = await prisma.invoice.findUnique({ where: { id: params.invoiceId } });
  if (!invoice || invoice.projectId !== params.projectId) throw new Error("Invoice not found.");
  if (!canTransitionInvoiceStatus(invoice.status, params.status)) throw new Error("Invalid status transition.");

  if (invoice.status === "PAID" || invoice.status === "VOID") throw new Error("Invoice is locked.");

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: params.status },
  });

  await refreshProjectPnlAlerts(params.projectId);
  await syncCollectionCaseForInvoice({ projectId: params.projectId, invoiceId: updated.id });
  return updated;
}

export async function recordPaymentReceipt(params: {
  projectId: string;
  invoiceId: string;
  receiptNumber: string;
  paymentDate: Date;
  amount: number;
  paymentMethod?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  allowOverpay?: boolean;
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { receipts: true, paymentScheduleAllocations: { include: { paymentSchedule: true } } },
  });
  if (!invoice || invoice.projectId !== params.projectId) throw new Error("Invoice not found.");
  if (invoice.status === "VOID") throw new Error("Cannot record payment on a void invoice.");

  const currentOutstanding = Number(invoice.outstandingAmount);
  const amount = roundCurrency(params.amount);
  if (amount <= 0) throw new Error("Amount must be positive.");
  if (!params.allowOverpay && amount > currentOutstanding + 0.01) {
    throw new Error("Payment exceeds outstanding amount.");
  }

  const nextOutstanding = Math.max(roundCurrency(currentOutstanding - amount), 0);
  const nextStatus: InvoiceStatus =
    nextOutstanding <= 0
      ? "PAID"
      : currentOutstanding > 0 && amount > 0
        ? "PARTIALLY_PAID"
        : invoice.status;

  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.paymentReceipt.create({
      data: {
        projectId: params.projectId,
        invoiceId: invoice.id,
        receiptNumber: params.receiptNumber,
        paymentDate: params.paymentDate,
        amount: toDecimal(amount),
        paymentMethod: params.paymentMethod ?? null,
        referenceNo: params.referenceNo ?? null,
        notes: params.notes ?? null,
      },
    });

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: { outstandingAmount: toDecimal(nextOutstanding), status: nextStatus },
    });

    // If invoice is linked to a progress claim, mark claim as PAID when fully settled.
    if (nextStatus === "PAID" && updatedInvoice.progressClaimId) {
      await tx.progressClaim.updateMany({
        where: { id: updatedInvoice.progressClaimId, projectId: params.projectId, status: { in: ["INVOICED", "APPROVED"] } },
        data: { status: "PAID" },
      });
    }

    // Update schedule paid amounts for any allocations on this invoice.
    const invoiceTotal = Number(invoice.totalAmount);
    const invoiceSubtotal = Number(invoice.subtotal);
    const netPaid = invoiceTotal > 0 ? roundCurrency(amount * (invoiceSubtotal / invoiceTotal)) : 0;

    const allocationBase = invoice.paymentScheduleAllocations.reduce(
      (sum, a) => sum + Number(a.allocatedSubtotal),
      0,
    );

    for (const alloc of invoice.paymentScheduleAllocations) {
      const schedule = alloc.paymentSchedule;
      const scheduled = Number(schedule.scheduledAmount);
      const paidBefore = Number(schedule.paidAmount);
      const allocationRatio =
        allocationBase > 0 ? Number(alloc.allocatedSubtotal) / allocationBase : 0;
      const allocatedNetPaid = roundCurrency(netPaid * allocationRatio);
      const paidAfter = Math.min(roundCurrency(paidBefore + allocatedNetPaid), scheduled);

      const billed = Number(schedule.billedAmount);
      const status: PaymentScheduleStatus =
        paidAfter >= scheduled
          ? "PAID"
          : paidAfter > 0
            ? "PARTIALLY_PAID"
            : billed > 0
              ? "BILLED"
              : "PENDING";

      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: { paidAmount: toDecimal(paidAfter), status },
      });
    }

    return created;
  });

  await refreshProjectPnlAlerts(params.projectId);
  await syncCollectionCaseForInvoice({ projectId: params.projectId, invoiceId: invoice.id });
  return receipt;
}

export async function computeProjectInvoiceSummary(projectId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { projectId, status: { not: "VOID" } },
    select: {
      id: true,
      totalAmount: true,
      outstandingAmount: true,
      dueDate: true,
      status: true,
    },
  });

  const receipts = await prisma.paymentReceipt.aggregate({
    where: { projectId },
    _sum: { amount: true },
  });

  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + Number(i.outstandingAmount), 0);
  const totalCollected = Number(receipts._sum.amount ?? 0);

  const now = Date.now();
  const overdueAmount = invoices.reduce((sum, inv) => {
    const overdue =
      inv.dueDate && inv.dueDate.getTime() < now && Number(inv.outstandingAmount) > 0 && inv.status !== "VOID";
    return sum + (overdue ? Number(inv.outstandingAmount) : 0);
  }, 0);

  return {
    totalInvoiced: roundCurrency(totalInvoiced),
    totalCollected: roundCurrency(totalCollected),
    totalOutstanding: roundCurrency(totalOutstanding),
    overdueAmount: roundCurrency(overdueAmount),
  };
}

export async function markOverdueInvoices(projectId: string) {
  const now = new Date();
  const candidates = await prisma.invoice.findMany({
    where: {
      projectId,
      dueDate: { lt: now },
      outstandingAmount: { gt: 0 },
      status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] },
    },
    select: { id: true, status: true },
  });

  if (candidates.length === 0) return { updated: 0 };

  const res = await prisma.invoice.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { status: "OVERDUE" },
  });

  await refreshProjectPnlAlerts(projectId);
  await refreshOverdueCollectionCases({ projectId });
  return { updated: res.count };
}

export async function createCreditNote(params: {
  projectId: string;
  invoiceId?: string | null;
  creditNoteNumber: string;
  issueDate: Date;
  amount: number;
  reason: string;
}) {
  const amount = roundCurrency(params.amount);
  if (amount <= 0) throw new Error("Amount must be positive.");

  const credit = await prisma.$transaction(async (tx) => {
    const created = await tx.creditNote.create({
      data: {
        projectId: params.projectId,
        invoiceId: params.invoiceId ?? null,
        creditNoteNumber: params.creditNoteNumber,
        issueDate: params.issueDate,
        amount: toDecimal(amount),
        reason: params.reason,
        status: "ISSUED",
      },
    });

    if (params.invoiceId) {
      const inv = await tx.invoice.findUnique({ where: { id: params.invoiceId } });
      if (!inv || inv.projectId !== params.projectId) throw new Error("Invoice not found.");
      if (inv.status === "VOID") throw new Error("Cannot apply credit note to a void invoice.");

      const nextOutstanding = Math.max(roundCurrency(Number(inv.outstandingAmount) - amount), 0);
      const nextStatus: InvoiceStatus = nextOutstanding <= 0 ? "PAID" : inv.status;
      await tx.invoice.update({
        where: { id: inv.id },
        data: { outstandingAmount: toDecimal(nextOutstanding), status: nextStatus },
      });
    }

    return created;
  });

  await refreshProjectPnlAlerts(params.projectId);
  if (params.invoiceId) {
    await syncCollectionCaseForInvoice({ projectId: params.projectId, invoiceId: params.invoiceId });
  }
  return credit;
}

export async function generatePaymentScheduleFromSignedContract(projectId: string) {
  const contract = await prisma.contract.findFirst({
    where: { projectId, status: "SIGNED" },
    orderBy: { contractDate: "desc" },
    include: { milestones: { orderBy: { sortOrder: "asc" } } },
  });
  if (!contract) throw new Error("No signed contract found.");
  if (contract.milestones.length === 0) throw new Error("Signed contract has no milestones.");

  const existing = await prisma.paymentSchedule.count({
    where: { projectId, contractId: contract.id },
  });
  if (existing > 0) return { created: 0, contractId: contract.id };

  const created = await prisma.paymentSchedule.createMany({
    data: contract.milestones.map((m) => ({
      projectId,
      contractId: contract.id,
      quotationId: contract.quotationId ?? null,
      label: m.title,
      scheduleType: "CONTRACT_MILESTONE",
      dueDate: m.dueDate ?? null,
      percentage: null,
      scheduledAmount: m.amount,
      billedAmount: new Prisma.Decimal(0),
      paidAmount: new Prisma.Decimal(0),
      status: "PENDING",
      sortOrder: m.sortOrder,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  });

  return { created: created.count, contractId: contract.id };
}

export async function generatePaymentScheduleFromApprovedQuotation(projectId: string) {
  const quotation = await prisma.quotation.findFirst({
    where: { projectId, status: "APPROVED" },
    orderBy: { issueDate: "desc" },
    include: { paymentTermsV2: { orderBy: { sortOrder: "asc" } } },
  });
  if (!quotation) throw new Error("No approved quotation found.");
  if (quotation.paymentTermsV2.length === 0) throw new Error("Approved quotation has no payment terms.");

  const netSubtotal = Math.max(roundCurrency(Number(quotation.subtotal) - Number(quotation.discountAmount)), 0);

  const existing = await prisma.paymentSchedule.count({
    where: { projectId, quotationId: quotation.id },
  });
  if (existing > 0) return { created: 0, quotationId: quotation.id };

  const created = await prisma.paymentSchedule.createMany({
    data: quotation.paymentTermsV2.map((t) => {
      const scheduled =
        t.amount !== null
          ? Number(t.amount)
          : t.percent !== null
            ? roundCurrency((Number(t.percent) / 100) * netSubtotal)
            : 0;
      return {
        projectId,
        quotationId: quotation.id,
        contractId: null,
        label: t.title,
        scheduleType: "QUOTATION_PAYMENT_TERM",
        dueDate: null,
        percentage: t.percent,
        scheduledAmount: toDecimal(scheduled),
        billedAmount: new Prisma.Decimal(0),
        paidAmount: new Prisma.Decimal(0),
        status: "PENDING",
        sortOrder: t.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
  });

  return { created: created.count, quotationId: quotation.id };
}
