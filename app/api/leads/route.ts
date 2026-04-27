import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { buildLeadVisibilityWhere, canAccessLeadsModule, canSubmitLead } from "@/lib/leads/access";
import { LeadSource, LeadStatus, ProjectType, PropertyCategory, PropertyType } from "@prisma/client";
import { normalizePhoneNumber } from "@/lib/validation/phone";
import { createLead } from "@/lib/leads/service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  customerName: z.string().min(1).max(140),
  customerPhone: z.string().min(1).max(40),
  customerEmail: z.string().email().optional().nullable(),
  projectType: z.nativeEnum(ProjectType).default(ProjectType.RESIDENTIAL),
  propertyType: z.nativeEnum(PropertyType).optional().nullable(),
  propertyAddress: z.string().optional().nullable(),
  projectAddress: z.string().min(1).max(280),
  estimatedBudget: z.coerce.number().min(0).optional().nullable(),
  preferredStartDate: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canAccessLeadsModule(session.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const where = buildLeadVisibilityWhere(session.user);
  const take = Math.min(Number(req.nextUrl.searchParams.get("take") ?? "50") || 50, 200);

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take,
    include: {
      submittedByUser: { select: { id: true, email: true, name: true } },
      assignedToUser: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ ok: true, data: leads });
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canSubmitLead(session.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const customerPhone = normalizePhoneNumber(parsed.data.customerPhone);
  if (!customerPhone) return NextResponse.json({ ok: false, error: "Invalid customerPhone" }, { status: 400 });

  const lead = await createLead({
    customerName: parsed.data.customerName,
    customerPhone,
    customerEmail: parsed.data.customerEmail ? parsed.data.customerEmail.toLowerCase() : null,
    projectType: parsed.data.projectType,
    propertyType: parsed.data.propertyType ?? null,
    propertyAddress: parsed.data.propertyAddress ?? null,
    projectAddress: parsed.data.projectAddress,
    estimatedBudget: parsed.data.estimatedBudget ?? null,
    preferredStartDate: parsed.data.preferredStartDate ? new Date(parsed.data.preferredStartDate) : null,
    remarks: parsed.data.remarks ?? null,
    source: LeadSource.MANUAL,
    marketingSource: null,
    status: LeadStatus.NEW,
    propertyCategory: PropertyCategory.RESIDENTIAL,
    submittedByUserId: session.user.id,
  });

  return NextResponse.json({ ok: true, data: lead }, { status: 201 });
}

