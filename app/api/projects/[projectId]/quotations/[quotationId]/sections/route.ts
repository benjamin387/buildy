import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";

const createSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().optional().default(""),
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

    const sectionCount = await prisma.quotationSection.count({ where: { quotationId } });
    const sortOrder = input.sortOrder ?? sectionCount;

    const section = await prisma.quotationSection.create({
      data: {
        quotationId,
        category: "OTHER",
        title: input.title,
        description: input.description || null,
        isIncluded: true,
        isOptional: false,
        remarks: null,
        sortOrder,
        subtotal: 0,
      },
    });

    await auditLog({
      module: "quotation",
      action: "section_create",
      actorUserId: userId,
      projectId,
      entityType: "QuotationSection",
      entityId: section.id,
      metadata: { quotationId, title: section.title },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotationId,
      projectId,
      actorUserId: userId,
      note: "Section created",
      data: { quotationId, sectionId: section.id, title: section.title },
    });

    return NextResponse.json({ success: true, data: { id: section.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add section";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

