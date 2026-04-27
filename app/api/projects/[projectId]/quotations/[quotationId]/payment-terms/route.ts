import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Permission, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { validatePaymentTerms } from "@/lib/quotations/payment-terms";

const createSchema = z.object({
  title: z.string().min(1).max(160),
  percent: z.coerce.number().min(0).max(100).nullable().optional().default(null),
  amount: z.coerce.number().min(0).nullable().optional().default(null),
  triggerType: z.string().max(60).nullable().optional().default(null),
  dueDays: z.coerce.number().int().min(0).nullable().optional().default(null),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; quotationId: string }> },
) {
  try {
    const { projectId, quotationId } = await context.params;
    const { userId } = await requirePermission({
      permission: Permission.QUOTE_WRITE,
      projectId,
    });

    const body = await request.json();
    const input = createSchema.parse(body);

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      select: { id: true, projectId: true },
    });
    if (!quotation || quotation.projectId !== projectId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const count = await prisma.quotationPaymentTerm.count({ where: { quotationId } });
    const sortOrder = input.sortOrder ?? count;

    const term = await prisma.$transaction(async (tx) => {
      const created = await tx.quotationPaymentTerm.create({
        data: {
          quotationId,
          title: input.title,
          // XOR rule: store either percent OR amount.
          percent: input.amount !== null ? null : input.percent === null ? null : new Prisma.Decimal(input.percent),
          amount: input.percent !== null ? null : input.amount === null ? null : new Prisma.Decimal(input.amount),
          triggerType: input.triggerType || null,
          dueDays: input.dueDays === null ? null : input.dueDays,
          dueDate: null,
          notes: null,
          sortOrder,
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

      return created;
    });

    await auditLog({
      module: "quotation",
      action: "payment_term_create",
      actorUserId: userId,
      projectId,
      entityType: "QuotationPaymentTerm",
      entityId: term.id,
      metadata: { quotationId },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotationId,
      projectId,
      actorUserId: userId,
      note: "Payment term created",
      data: { quotationId, termId: term.id, input },
    });

    return NextResponse.json({ success: true, data: { id: term.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add payment term";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
