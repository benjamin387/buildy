import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";

const updateSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().optional().default(""),
  category: z
    .enum([
      "HACKING_DEMOLITION",
      "MASONRY_WORKS",
      "CARPENTRY",
      "ELECTRICAL_WORKS",
      "PLUMBING_WORKS",
      "CEILING_PARTITION",
      "FLOORING",
      "PAINTING_WORKS",
      "GLASS_ALUMINIUM",
      "CLEANING_DISPOSAL",
      "OTHER",
    ])
    .optional(),
  isIncluded: z.boolean().optional(),
  isOptional: z.boolean().optional(),
  remarks: z.string().optional().default(""),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; quotationId: string; sectionId: string }> },
) {
  try {
    const { projectId, quotationId, sectionId } = await context.params;
    const { userId } = await requirePermission({
      permission: Permission.QUOTE_WRITE,
      projectId,
    });

    const body = await request.json();
    const input = updateSchema.parse(body);

    const section = await prisma.quotationSection.findUnique({
      where: { id: sectionId },
      include: { quotation: { select: { id: true, projectId: true } } },
    });

    if (!section || section.quotationId !== quotationId || section.quotation.projectId !== projectId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await prisma.quotationSection.update({
      where: { id: sectionId },
      data: {
        title: input.title,
        description: input.description || null,
        category: input.category ?? undefined,
        isIncluded: input.isIncluded ?? undefined,
        isOptional: input.isOptional ?? undefined,
        remarks: input.remarks || null,
        sortOrder: input.sortOrder ?? undefined,
      },
    });

    await auditLog({
      module: "quotation",
      action: "section_update",
      actorUserId: userId,
      projectId,
      entityType: "QuotationSection",
      entityId: sectionId,
      metadata: { quotationId },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotationId,
      projectId,
      actorUserId: userId,
      note: "Section updated",
      data: { quotationId, sectionId, input },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update section";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

