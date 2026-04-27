import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Permission, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { validatePaymentTerms } from "@/lib/quotations/payment-terms";

const updateSchema = z.object({
  title: z.string().min(1).max(160),
  percent: z.coerce.number().min(0).max(100).nullable().optional().default(null),
  amount: z.coerce.number().min(0).nullable().optional().default(null),
  triggerType: z.string().max(60).nullable().optional().default(null),
  dueDays: z.coerce.number().int().min(0).nullable().optional().default(null),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; quotationId: string; termId: string }> },
) {
  try {
    const { projectId, quotationId, termId } = await context.params;
    const { userId } = await requirePermission({
      permission: Permission.QUOTE_WRITE,
      projectId,
    });

    const term = await prisma.quotationPaymentTerm.findUnique({
      where: { id: termId },
      include: { quotation: { select: { id: true, projectId: true } } },
    });
    if (!term || term.quotationId !== quotationId || term.quotation.projectId !== projectId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const input = updateSchema.parse(body);

    await prisma.$transaction(async (tx) => {
      await tx.quotationPaymentTerm.update({
        where: { id: termId },
        data: {
          title: input.title,
          // XOR rule: store either percent OR amount.
          percent: input.amount !== null ? null : input.percent === null ? null : new Prisma.Decimal(input.percent),
          amount: input.percent !== null ? null : input.amount === null ? null : new Prisma.Decimal(input.amount),
          triggerType: input.triggerType || null,
          dueDays: input.dueDays === null ? null : input.dueDays,
          sortOrder: input.sortOrder ?? undefined,
        },
      });

      const quotation = await tx.quotation.findUnique({
        where: { id: quotationId },
        select: { subtotal: true },
      });
      if (!quotation) throw new Error("Not found.");

      const terms = await tx.quotationPaymentTerm.findMany({
        where: { quotationId },
        orderBy: { sortOrder: "asc" },
      });
      const validated = validatePaymentTerms({
        subtotal: Number(quotation.subtotal),
        terms: terms.map((t, index) => ({
          title: t.title,
          percent: t.percent === null ? null : Number(t.percent),
          amount: t.amount === null ? null : Number(t.amount),
          triggerType: t.triggerType ?? null,
          dueDays: t.dueDays ?? null,
          sortOrder: t.sortOrder ?? index,
        })),
      });
      if (!validated.ok) throw new Error(validated.error);
    });

    await auditLog({
      module: "quotation",
      action: "payment_term_update",
      actorUserId: userId,
      projectId,
      entityType: "QuotationPaymentTerm",
      entityId: termId,
      metadata: { quotationId },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotationId,
      projectId,
      actorUserId: userId,
      note: "Payment term updated",
      data: { quotationId, termId, input },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update payment term";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; quotationId: string; termId: string }> },
) {
  try {
    const { projectId, quotationId, termId } = await context.params;
    const { userId } = await requirePermission({
      permission: Permission.QUOTE_WRITE,
      projectId,
    });

    const term = await prisma.quotationPaymentTerm.findUnique({
      where: { id: termId },
      include: { quotation: { select: { id: true, projectId: true } } },
    });
    if (!term || term.quotationId !== quotationId || term.quotation.projectId !== projectId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.quotationPaymentTerm.delete({ where: { id: termId } });

      const quotation = await tx.quotation.findUnique({
        where: { id: quotationId },
        select: { subtotal: true },
      });
      if (!quotation) throw new Error("Not found.");

      const terms = await tx.quotationPaymentTerm.findMany({
        where: { quotationId },
        orderBy: { sortOrder: "asc" },
      });
      const validated = validatePaymentTerms({
        subtotal: Number(quotation.subtotal),
        terms: terms.map((t, index) => ({
          title: t.title,
          percent: t.percent === null ? null : Number(t.percent),
          amount: t.amount === null ? null : Number(t.amount),
          triggerType: t.triggerType ?? null,
          dueDays: t.dueDays ?? null,
          sortOrder: t.sortOrder ?? index,
        })),
      });
      if (!validated.ok) throw new Error(validated.error);
    });

    await auditLog({
      module: "quotation",
      action: "payment_term_delete",
      actorUserId: userId,
      projectId,
      entityType: "QuotationPaymentTerm",
      entityId: termId,
      metadata: { quotationId },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotationId,
      projectId,
      actorUserId: userId,
      note: "Payment term removed",
      data: { quotationId, termId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove payment term";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
