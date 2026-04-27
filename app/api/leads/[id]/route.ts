import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { buildLeadVisibilityWhere, canAccessLeadsModule } from "@/lib/leads/access";
import { LeadStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  assignedToUserId: z.string().optional().nullable(),
});

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canAccessLeadsModule(session.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const where = { AND: [buildLeadVisibilityWhere(session.user), { id }] };

  const lead = await prisma.lead.findFirst({
    where,
    include: {
      activities: { orderBy: [{ createdAt: "desc" }] },
      submittedByUser: { select: { id: true, email: true, name: true } },
      assignedToUser: { select: { id: true, email: true, name: true } },
      convertedProject: { select: { id: true, name: true, projectCode: true } },
    },
  });

  if (!lead) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, data: lead });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canAccessLeadsModule(session.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const existing = await prisma.lead.findFirst({
    where: { AND: [buildLeadVisibilityWhere(session.user), { id }] },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const canAssign = session.user.isAdmin || session.user.roleKeys.includes("DIRECTOR");

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      status: parsed.data.status ?? undefined,
      assignedToUserId: canAssign ? (parsed.data.assignedToUserId ?? null) : undefined,
    },
  });

  return NextResponse.json({ ok: true, data: updated });
}

