import { prisma } from "@/lib/prisma";
import type {
  CommunicationChannel,
  LeadActivityType,
  LeadSource,
  LeadStatus,
  PropertyType,
  Prisma,
  ProjectType,
  PropertyCategory,
  ResidentialPropertyType,
  HdbType,
  CondoType,
  LandedType,
  DesignStyle,
} from "@prisma/client";
import { generateLeadNumber } from "@/lib/leads/lead-number";
import type { SessionUser } from "@/lib/auth/session";
import { buildLeadVisibilityWhere } from "@/lib/leads/access";

function getLeadDelegate() {
  // Runtime guard: if Prisma Client wasn't regenerated after adding Lead, prisma.lead can be undefined.
  // We return null so read paths can fail-soft and not take down the dashboard.
  const delegate = (prisma as unknown as { lead?: typeof prisma.lead }).lead;
  return delegate ?? null;
}

export type LeadFilters = {
  search?: string;
  status?: LeadStatus | "ALL";
  assignedSalesEmail?: string;
  residentialPropertyType?: ResidentialPropertyType | "ALL";
};

export type LeadListRow = Prisma.LeadGetPayload<{
  include: {
    convertedProject: { select: { id: true; name: true; projectCode: true } };
    submittedByUser: { select: { id: true; email: true; name: true } };
    assignedToUser: { select: { id: true; email: true; name: true } };
  };
}>;

function leadSearchWhere(search: string): Prisma.LeadWhereInput {
  return {
    OR: [
      { leadNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { customerEmail: { contains: search, mode: "insensitive" } },
      { customerPhone: { contains: search, mode: "insensitive" } },
      { projectAddress: { contains: search, mode: "insensitive" } },
      { propertyAddress: { contains: search, mode: "insensitive" } },
      { assignedSalesName: { contains: search, mode: "insensitive" } },
      { assignedSalesEmail: { contains: search, mode: "insensitive" } },
      { marketingSource: { contains: search, mode: "insensitive" } },
    ],
  };
}

export async function listLeads(filters: LeadFilters) {
  return listLeadsForViewer({ viewer: null, filters });
}

export type LeadListPage = { items: LeadListRow[]; total: number };

export async function listLeadsForViewer(params: {
  viewer: SessionUser | null;
  filters: LeadFilters;
  skip?: number;
  take?: number;
}): Promise<LeadListPage> {
  const lead = getLeadDelegate();
  if (!lead) return { items: [], total: 0 };

  const search = params.filters.search?.trim();
  const visibility = params.viewer ? buildLeadVisibilityWhere(params.viewer) : {};

  const where: Prisma.LeadWhereInput = {
    AND: [
      visibility,
      {
        ...(search ? leadSearchWhere(search) : {}),
        ...(params.filters.status && params.filters.status !== "ALL" ? { status: params.filters.status } : {}),
        ...(params.filters.assignedSalesEmail
          ? { assignedSalesEmail: { equals: params.filters.assignedSalesEmail, mode: "insensitive" } }
          : {}),
        ...(params.filters.residentialPropertyType && params.filters.residentialPropertyType !== "ALL"
          ? { residentialPropertyType: params.filters.residentialPropertyType }
          : {}),
      },
    ],
  };

  try {
    const [items, total] = await Promise.all([
      lead.findMany({
        where,
        orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
        include: {
          convertedProject: { select: { id: true, name: true, projectCode: true } },
          submittedByUser: { select: { id: true, email: true, name: true } },
          assignedToUser: { select: { id: true, email: true, name: true } },
        },
        skip: params.skip ?? 0,
        take: params.take ?? 50,
      }),
      lead.count({ where }),
    ]);
    return { items: items as LeadListRow[], total };
  } catch (err) {
    // Fail-soft for dev/prod stability:
    // If Prisma Client is stale (or schema just changed), relation includes/orderBy can throw
    // PrismaClientValidationError and crash the page. Fall back to a minimal scalar-only query.
    const msg = err instanceof Error ? err.message : "";
    const name = (err as any)?.name as string | undefined;
    const isValidation =
      name === "PrismaClientValidationError" || msg.includes("Invalid `") || msg.includes("invocation");
    if (!isValidation) throw err;

    try {
      const [rows, total] = await Promise.all([
        lead.findMany({
          orderBy: [{ createdAt: "desc" }],
          skip: params.skip ?? 0,
          take: params.take ?? 50,
        }),
        lead.count(),
      ]);

      return {
        items: (rows as any[]).map((r) => ({
          ...r,
          convertedProject: null,
          submittedByUser: null,
          assignedToUser: null,
        })) as LeadListRow[],
        total,
      };
    } catch {
      return { items: [], total: 0 };
    }
  }
}

export async function computeLeadPipelineSummary(viewer?: SessionUser | null) {
  const lead = getLeadDelegate();
  if (!lead) {
    return {
      newLeads: 0,
      contacted: 0,
      siteVisits: 0,
      quotationPending: 0,
      converted: 0,
    };
  }

  const visibility = viewer ? buildLeadVisibilityWhere(viewer) : {};
  const rows =
    (await lead
      .groupBy({
        by: ["status"],
        _count: { _all: true },
        where: visibility,
      })
      .catch(() => [])) ?? [];

  const count = (status: LeadStatus) => rows.find((r) => r.status === status)?._count._all ?? 0;

  return {
    newLeads: count("NEW"),
    contacted: count("CONTACTED"),
    siteVisits: count("SITE_VISIT_SCHEDULED"),
    quotationPending: count("QUOTATION_PENDING"),
    converted: count("CONVERTED"),
  };
}

export async function computeFollowUpsDueToday() {
  const lead = getLeadDelegate();
  if (!lead) return { dueToday: 0 };

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const count = await lead.count({
    where: {
      status: { notIn: ["CONVERTED", "LOST"] },
      nextFollowUpAt: { gte: start, lte: end },
    },
  });

  return { dueToday: count };
}

export async function getLeadById(leadId: string) {
  return getLeadByIdForViewer({ viewer: null, leadId });
}

export async function getLeadByIdForViewer(params: { viewer: SessionUser | null; leadId: string }) {
  const lead = getLeadDelegate();
  if (!lead) return null;

  const visibility = params.viewer ? buildLeadVisibilityWhere(params.viewer) : {};
  return lead.findFirst({
    where: { AND: [visibility, { id: params.leadId }] },
    include: {
      activities: { orderBy: [{ createdAt: "desc" }] },
      convertedProject: { select: { id: true, name: true, projectCode: true } },
      submittedByUser: { select: { id: true, email: true, name: true } },
      assignedToUser: { select: { id: true, email: true, name: true } },
    },
  });
}

export type CreateLeadInput = {
  leadNumber?: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  source?: LeadSource;
  marketingSource?: string | null;
  status?: LeadStatus;
  assignedSalesName?: string | null;
  assignedSalesEmail?: string | null;
  submittedByUserId?: string | null;
  assignedToUserId?: string | null;
  projectAddress: string;
  projectType: ProjectType;
  propertyType?: PropertyType | null;
  propertyAddress?: string | null;
  estimatedBudget?: Prisma.Decimal | number | string | null;
  preferredStartDate?: Date | null;
  remarks?: string | null;
  propertyCategory: PropertyCategory;
  residentialPropertyType?: ResidentialPropertyType | null;
  hdbType?: HdbType | null;
  condoType?: CondoType | null;
  landedType?: LandedType | null;
  preferredDesignStyle?: DesignStyle | null;
  requirementSummary?: string | null;
  notes?: string | null;
  nextFollowUpAt?: Date | null;
};

export async function createLead(input: CreateLeadInput) {
  const lead = getLeadDelegate();
  if (!lead) throw new Error("Lead model is not available. Run prisma generate and restart the server.");

  const leadNumber = input.leadNumber?.trim() || generateLeadNumber();
  return lead.create({
    data: {
      leadNumber,
      customerName: input.customerName,
      customerEmail: input.customerEmail ?? null,
      customerPhone: input.customerPhone ?? null,
      source: input.source ?? "MANUAL",
      marketingSource: input.marketingSource ?? null,
      status: input.status ?? "NEW",
      assignedSalesName: input.assignedSalesName ?? null,
      assignedSalesEmail: input.assignedSalesEmail ?? null,
      submittedByUserId: input.submittedByUserId ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      projectAddress: input.projectAddress,
      projectType: input.projectType,
      propertyType: input.propertyType ?? null,
      propertyAddress: input.propertyAddress ?? null,
      estimatedBudget: input.estimatedBudget === null || input.estimatedBudget === undefined ? undefined : (input.estimatedBudget as any),
      preferredStartDate: input.preferredStartDate ?? null,
      remarks: input.remarks ?? null,
      propertyCategory: input.propertyCategory,
      residentialPropertyType: input.residentialPropertyType ?? null,
      hdbType: input.hdbType ?? null,
      condoType: input.condoType ?? null,
      landedType: input.landedType ?? null,
      preferredDesignStyle: input.preferredDesignStyle ?? null,
      requirementSummary: input.requirementSummary ?? null,
      notes: input.notes ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
    },
  });
}

export type UpdateLeadInput = CreateLeadInput & { leadId: string };

export async function updateLead(input: UpdateLeadInput) {
  const lead = getLeadDelegate();
  if (!lead) throw new Error("Lead model is not available. Run prisma generate and restart the server.");

  return lead.update({
    where: { id: input.leadId },
    data: {
      customerName: input.customerName,
      customerEmail: input.customerEmail ?? null,
      customerPhone: input.customerPhone ?? null,
      source: input.source ?? undefined,
      marketingSource: input.marketingSource ?? null,
      status: input.status ?? undefined,
      assignedSalesName: input.assignedSalesName ?? null,
      assignedSalesEmail: input.assignedSalesEmail ?? null,
      submittedByUserId: input.submittedByUserId ?? undefined,
      assignedToUserId: input.assignedToUserId ?? undefined,
      projectAddress: input.projectAddress,
      projectType: input.projectType,
      propertyType: input.propertyType ?? null,
      propertyAddress: input.propertyAddress ?? null,
      estimatedBudget: input.estimatedBudget === null || input.estimatedBudget === undefined ? undefined : (input.estimatedBudget as any),
      preferredStartDate: input.preferredStartDate ?? null,
      remarks: input.remarks ?? null,
      propertyCategory: input.propertyCategory,
      residentialPropertyType: input.residentialPropertyType ?? null,
      hdbType: input.hdbType ?? null,
      condoType: input.condoType ?? null,
      landedType: input.landedType ?? null,
      preferredDesignStyle: input.preferredDesignStyle ?? null,
      requirementSummary: input.requirementSummary ?? null,
      notes: input.notes ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
    },
  });
}

export async function addLeadActivity(params: {
  leadId: string;
  activityType: LeadActivityType;
  channel: CommunicationChannel;
  summary: string;
  notes?: string | null;
  followUpAt?: Date | null;
  createdBy: string;
}) {
  const activity = await prisma.leadActivity.create({
    data: {
      leadId: params.leadId,
      activityType: params.activityType,
      channel: params.channel,
      summary: params.summary,
      notes: params.notes ?? null,
      followUpAt: params.followUpAt ?? null,
      createdBy: params.createdBy,
    },
  });

  if (params.followUpAt) {
    await prisma.lead.update({
      where: { id: params.leadId },
      data: { nextFollowUpAt: params.followUpAt },
    });
  }

  return activity;
}
