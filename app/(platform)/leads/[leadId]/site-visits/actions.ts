"use server";

import { z } from "zod";
import { Permission, Prisma, type LineItemType, type ScopeCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { auditLog, createRevision } from "@/lib/audit";
import { toRevisionJson } from "@/lib/audit/serialize";
import { storeSiteVisitPhoto } from "@/lib/site-visits/storage";
import {
  addMeasurementNote,
  addSitePhoto,
  addSiteVisitArea,
  markSiteVisitStatus,
  upsertBudgetRange,
  upsertRequirementChecklist,
  upsertTimelineExpectation,
} from "@/lib/site-visits/service";
import { defaultRenovationSections } from "@/lib/quotation-engine/renovation-default-sections";
import { computeProjectQuotationSummary } from "@/lib/quotation-engine/project-quotation-math";
import { generateQuoteReference } from "@/lib/quotation-engine/quote-reference";
import { recomputeQuotationDerivedTotals } from "@/lib/quotations/service";
import { createProject } from "@/lib/projects/service";

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

function mapLeadToProjectPropertyType(lead: {
  propertyCategory: "RESIDENTIAL" | "COMMERCIAL";
  residentialPropertyType: "HDB" | "CONDO" | "LANDED" | null;
}): "HDB" | "CONDO" | "LANDED" | "COMMERCIAL" | "OTHER" {
  if (lead.propertyCategory === "COMMERCIAL") return "COMMERCIAL";
  if (lead.residentialPropertyType === "HDB") return "HDB";
  if (lead.residentialPropertyType === "CONDO") return "CONDO";
  if (lead.residentialPropertyType === "LANDED") return "LANDED";
  return "OTHER";
}

const createVisitSchema = z.object({
  leadId: z.string().min(1),
  scheduledAt: z.string().min(1),
  addressSnapshot: z.string().min(1).max(280),
  assignedSalesName: z.string().optional().or(z.literal("")).default(""),
  assignedSalesEmail: z.string().optional().or(z.literal("")).default(""),
  assignedDesignerName: z.string().optional().or(z.literal("")).default(""),
  assignedDesignerEmail: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function createLeadSiteVisitAction(formData: FormData) {
  const user = await requireUser();
  const leadId = String(formData.get("leadId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = createVisitSchema.safeParse({
    leadId,
    scheduledAt: formData.get("scheduledAt"),
    addressSnapshot: formData.get("addressSnapshot"),
    assignedSalesName: formData.get("assignedSalesName"),
    assignedSalesEmail: formData.get("assignedSalesEmail"),
    assignedDesignerName: formData.get("assignedDesignerName"),
    assignedDesignerEmail: formData.get("assignedDesignerEmail"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid site visit.");

  const visit = await prisma.$transaction(async (tx) => {
    const created = await tx.siteVisit.create({
      data: {
        leadId: parsed.data.leadId,
        projectId: null,
        status: "SCHEDULED",
        scheduledAt: toDate(parsed.data.scheduledAt),
        completedAt: null,
        addressSnapshot: parsed.data.addressSnapshot,
        assignedSalesName: parsed.data.assignedSalesName || null,
        assignedSalesEmail: parsed.data.assignedSalesEmail || null,
        assignedDesignerName: parsed.data.assignedDesignerName || null,
        assignedDesignerEmail: parsed.data.assignedDesignerEmail || null,
        notes: parsed.data.notes || null,
      },
    });

    await tx.lead.update({
      where: { id: parsed.data.leadId },
      data: { status: "SITE_VISIT_SCHEDULED" },
    });

    await tx.leadActivity.create({
      data: {
        leadId: parsed.data.leadId,
        activityType: "SITE_VISIT",
        channel: "MEETING",
        summary: "Site visit scheduled",
        notes: `Scheduled at ${created.scheduledAt.toISOString()}`,
        followUpAt: created.scheduledAt,
        createdBy: user.email,
      },
    });

    return created;
  });

  await auditLog({
    module: "site_visit",
    action: "create",
    actorUserId: user.id,
    projectId: null,
    entityType: "SiteVisit",
    entityId: visit.id,
    metadata: { leadId: parsed.data.leadId, scheduledAt: visit.scheduledAt.toISOString() },
  });

  await createRevision({
    entityType: "SiteVisit",
    entityId: visit.id,
    projectId: null,
    actorUserId: user.id,
    note: "Site visit scheduled",
    data: toRevisionJson(visit),
  });

  revalidatePath(`/leads/${leadId}/site-visits`);
  redirect(`/leads/${leadId}/site-visits/${visit.id}`);
}

const statusSchema = z.object({
  leadId: z.string().min(1),
  siteVisitId: z.string().min(1),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]),
});

export async function markSiteVisitStatusAction(formData: FormData) {
  const user = await requireUser();
  const leadId = String(formData.get("leadId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = statusSchema.safeParse({
    leadId,
    siteVisitId: formData.get("siteVisitId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const visit = await prisma.siteVisit.findUnique({ where: { id: parsed.data.siteVisitId } });
  if (!visit || visit.leadId !== parsed.data.leadId) throw new Error("Not found.");

  const updated = await markSiteVisitStatus({ siteVisitId: visit.id, status: parsed.data.status });
  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: {
      status: parsed.data.status === "COMPLETED" ? "QUOTATION_PENDING" : undefined,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: parsed.data.leadId,
      activityType: "NOTE",
      channel: "OTHER",
      summary: `Site visit marked ${parsed.data.status}`,
      notes: null,
      followUpAt: null,
      createdBy: user.email,
    },
  });

  revalidatePath(`/leads/${leadId}/site-visits/${visit.id}`);
  redirect(`/leads/${leadId}/site-visits/${visit.id}`);
}

const addAreaSchema = z.object({
  leadId: z.string().min(1),
  siteVisitId: z.string().min(1),
  title: z.string().min(1).max(120),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function addSiteVisitAreaAction(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = addAreaSchema.safeParse({
    leadId,
    siteVisitId: formData.get("siteVisitId"),
    title: formData.get("title"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid area.");

  const visit = await prisma.siteVisit.findUnique({ where: { id: parsed.data.siteVisitId } });
  if (!visit || visit.leadId !== parsed.data.leadId) throw new Error("Not found.");

  await addSiteVisitArea({
    siteVisitId: parsed.data.siteVisitId,
    title: parsed.data.title,
    notes: parsed.data.notes || null,
  });

  revalidatePath(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
  redirect(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
}

const addMeasurementSchema = z.object({
  leadId: z.string().min(1),
  siteVisitId: z.string().min(1),
  areaId: z.string().optional().or(z.literal("")).default(""),
  title: z.string().min(1).max(140),
  value: z.string().min(1).max(80),
  unit: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function addMeasurementNoteAction(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = addMeasurementSchema.safeParse({
    leadId,
    siteVisitId: formData.get("siteVisitId"),
    areaId: formData.get("areaId"),
    title: formData.get("title"),
    value: formData.get("value"),
    unit: formData.get("unit"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid measurement.");

  const visit = await prisma.siteVisit.findUnique({ where: { id: parsed.data.siteVisitId } });
  if (!visit || visit.leadId !== parsed.data.leadId) throw new Error("Not found.");

  await addMeasurementNote({
    siteVisitId: parsed.data.siteVisitId,
    areaId: parsed.data.areaId || null,
    title: parsed.data.title,
    value: parsed.data.value,
    unit: parsed.data.unit || null,
    notes: parsed.data.notes || null,
  });

  revalidatePath(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
  redirect(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
}

const uploadPhotoSchema = z.object({
  leadId: z.string().min(1),
  siteVisitId: z.string().min(1),
  areaId: z.string().optional().or(z.literal("")).default(""),
  caption: z.string().optional().or(z.literal("")).default(""),
});

export async function uploadSitePhotoAction(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = uploadPhotoSchema.safeParse({
    leadId,
    siteVisitId: formData.get("siteVisitId"),
    areaId: formData.get("areaId"),
    caption: formData.get("caption"),
  });
  if (!parsed.success) throw new Error("Invalid upload.");

  const file = formData.get("photo");
  if (!(file instanceof File)) throw new Error("Missing file.");

  const visit = await prisma.siteVisit.findUnique({ where: { id: parsed.data.siteVisitId } });
  if (!visit || visit.leadId !== parsed.data.leadId) throw new Error("Not found.");

  const stored = await storeSiteVisitPhoto({ siteVisitId: parsed.data.siteVisitId, file });
  await addSitePhoto({
    siteVisitId: parsed.data.siteVisitId,
    areaId: parsed.data.areaId || null,
    fileUrl: stored.fileUrl,
    fileName: stored.fileName,
    caption: parsed.data.caption || null,
  });

  revalidatePath(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
  redirect(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
}

const checklistSchema = z.object({
  leadId: z.string().min(1),
  siteVisitId: z.string().min(1),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function saveChecklistAction(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = checklistSchema.safeParse({
    leadId,
    siteVisitId: formData.get("siteVisitId"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid checklist.");

  const visit = await prisma.siteVisit.findUnique({ where: { id: parsed.data.siteVisitId } });
  if (!visit || visit.leadId !== parsed.data.leadId) throw new Error("Not found.");

  const checkbox = (name: string) => formData.get(name) === "on";
  const text = (name: string) => {
    const v = String(formData.get(name) ?? "").trim();
    return v.length > 0 ? v : null;
  };

  const items = {
    scope: {
      hacking: checkbox("scope_hacking"),
      masonry: checkbox("scope_masonry"),
      carpentry: checkbox("scope_carpentry"),
      electrical: checkbox("scope_electrical"),
      plumbing: checkbox("scope_plumbing"),
      ceiling: checkbox("scope_ceiling"),
      flooring: checkbox("scope_flooring"),
      painting: checkbox("scope_painting"),
      glass: checkbox("scope_glass"),
      cleaning: checkbox("scope_cleaning"),
      aircon: checkbox("scope_aircon"),
      other: text("scope_other"),
    },
    preferences: {
      designStyle: text("pref_design_style"),
      colorPalette: text("pref_color_palette"),
      specialNotes: text("pref_notes"),
    },
    constraints: {
      workingHours: text("con_working_hours"),
      accessRestrictions: text("con_access"),
      managementApproval: checkbox("con_management_approval"),
      petsAtHome: checkbox("con_pets"),
      other: text("con_other"),
    },
  };
  await upsertRequirementChecklist({
    siteVisitId: parsed.data.siteVisitId,
    items,
    notes: parsed.data.notes || null,
  });

  revalidatePath(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
  redirect(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
}

const budgetSchema = z.object({
  leadId: z.string().min(1),
  siteVisitId: z.string().min(1),
  minAmount: z.coerce.number().optional().default(NaN),
  maxAmount: z.coerce.number().optional().default(NaN),
  currency: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function saveBudgetAction(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = budgetSchema.safeParse({
    leadId,
    siteVisitId: formData.get("siteVisitId"),
    minAmount: formData.get("minAmount"),
    maxAmount: formData.get("maxAmount"),
    currency: formData.get("currency"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid budget.");

  const visit = await prisma.siteVisit.findUnique({ where: { id: parsed.data.siteVisitId } });
  if (!visit || visit.leadId !== parsed.data.leadId) throw new Error("Not found.");

  const min = Number.isFinite(parsed.data.minAmount) ? parsed.data.minAmount : null;
  const max = Number.isFinite(parsed.data.maxAmount) ? parsed.data.maxAmount : null;
  await upsertBudgetRange({
    siteVisitId: parsed.data.siteVisitId,
    minAmount: min,
    maxAmount: max,
    currency: parsed.data.currency || "SGD",
    notes: parsed.data.notes || null,
  });

  revalidatePath(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
  redirect(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
}

const timelineSchema = z.object({
  leadId: z.string().min(1),
  siteVisitId: z.string().min(1),
  desiredStartDate: z.string().optional().or(z.literal("")).default(""),
  desiredCompletionDate: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function saveTimelineAction(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = timelineSchema.safeParse({
    leadId,
    siteVisitId: formData.get("siteVisitId"),
    desiredStartDate: formData.get("desiredStartDate"),
    desiredCompletionDate: formData.get("desiredCompletionDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid timeline.");

  const visit = await prisma.siteVisit.findUnique({ where: { id: parsed.data.siteVisitId } });
  if (!visit || visit.leadId !== parsed.data.leadId) throw new Error("Not found.");

  await upsertTimelineExpectation({
    siteVisitId: parsed.data.siteVisitId,
    desiredStartDate: parsed.data.desiredStartDate ? toDate(parsed.data.desiredStartDate) : null,
    desiredCompletionDate: parsed.data.desiredCompletionDate
      ? toDate(parsed.data.desiredCompletionDate)
      : null,
    notes: parsed.data.notes || null,
  });

  revalidatePath(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
  redirect(`/leads/${leadId}/site-visits/${parsed.data.siteVisitId}`);
}

const createQuoteSchema = z.object({
  leadId: z.string().min(1),
  siteVisitId: z.string().min(1),
});

export async function createQuotationDraftFromSiteVisitAction(formData: FormData) {
  const user = await requireUser();
  const leadId = String(formData.get("leadId") ?? "");
  const parsed = createQuoteSchema.safeParse({
    leadId,
    siteVisitId: formData.get("siteVisitId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const visit = await prisma.siteVisit.findUnique({
    where: { id: parsed.data.siteVisitId },
    include: { lead: true },
  });
  if (!visit || visit.leadId !== parsed.data.leadId) throw new Error("Not found.");
  if (!visit.lead) throw new Error("Lead not found.");
  if (visit.status !== "COMPLETED") throw new Error("Complete the site visit before creating a quotation draft.");

  // Ensure project exists: if lead is already converted, use it; otherwise convert now.
  let projectId = visit.projectId || visit.lead.convertedProjectId;
  if (!projectId) {
    await requirePermission({ permission: Permission.PROJECT_WRITE });
    const propertyType = mapLeadToProjectPropertyType({
      propertyCategory: visit.lead.propertyCategory,
      residentialPropertyType: visit.lead.residentialPropertyType,
    });

    // Reuse the existing conversion logic shape (createProject creates Client + Project).
    const { project } = await createProject({
      projectCode: undefined,
      name: `${visit.lead.customerName} Project`,
      projectType: visit.lead.projectType,
      status: "LEAD",
      clientName: visit.lead.customerName,
      clientCompany: null,
      clientEmail: visit.lead.customerEmail ?? null,
      clientPhone: visit.lead.customerPhone ?? null,
      siteAddress: visit.lead.projectAddress,
      startDate: null,
      targetCompletionDate: null,
      actualCompletionDate: null,
      contractValue: 0,
      revisedContractValue: 0,
      estimatedCost: 0,
      committedCost: 0,
      actualCost: 0,
      notes: visit.lead.notes ?? null,
      addressLine1: visit.lead.projectAddress,
      addressLine2: null,
      postalCode: null,
      propertyType,
      unitSizeSqft: 0,
    });

    await prisma.$transaction(async (tx) => {
      const existingProfile = await tx.projectCommercialProfile.findUnique({
        where: { projectId: project.id },
        select: { id: true },
      });
      if (!existingProfile) {
        await tx.projectCommercialProfile.create({ data: { projectId: project.id, status: "LEAD" } });
      }

      await tx.lead.update({
        where: { id: visit.lead!.id },
        data: { status: "CONVERTED", convertedProjectId: project.id, convertedAt: new Date(), nextFollowUpAt: null },
      });

      await tx.siteVisit.update({ where: { id: visit.id }, data: { projectId: project.id } });
      await tx.leadActivity.create({
        data: {
          leadId: visit.lead!.id,
          activityType: "NOTE",
          channel: "OTHER",
          summary: "Converted to project (via site visit)",
          notes: `Project created for quotation draft.`,
          followUpAt: null,
          createdBy: user.email,
        },
      });
    });

    projectId = project.id;
  }

  await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  if (!visit.projectId) {
    // Link the visit to the project to make it visible in project-level lists.
    await prisma.siteVisit.update({ where: { id: visit.id }, data: { projectId } });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true, commercialProfile: true },
  });
  if (!project) throw new Error("Project not found.");

  const issueDate = new Date();
  const gstRate = project.commercialProfile?.gstRate ? Number(project.commercialProfile.gstRate) : 0.09;

  // Create a draft quotation with default sections and a single blank line item per section.
  const builderSections = structuredClone(defaultRenovationSections);

  const computed = computeProjectQuotationSummary({
    sections: builderSections,
    discountAmount: 0,
    gstRate,
  });

  const created = await prisma.$transaction(async (tx) => {
    await tx.quotation.updateMany({
      where: { projectId, isLatest: true },
      data: { isLatest: false },
    });

    const quotation = await tx.quotation.create({
      data: {
        clientId: project.clientId,
        projectId,
        quotationNumber: generateQuoteReference(issueDate),
        version: 1,
        isLatest: true,
        issueDate,
        validityDays: 14,
        status: "DRAFT",
        clientNameSnapshot: project.client.name,
        companyNameSnapshot: project.client.companyName ?? null,
        contactPersonSnapshot: project.client.contactPerson ?? null,
        contactPhoneSnapshot: project.client.phone ?? null,
        contactEmailSnapshot: project.client.email ?? null,
        projectNameSnapshot: project.name,
        projectAddress1: project.addressLine1,
        projectAddress2: project.addressLine2 ?? null,
        projectPostalCode: project.postalCode ?? null,
        propertyType: project.propertyType,
        unitSizeSqft: project.unitSizeSqft ?? null,
        subtotal: new Prisma.Decimal(computed.subtotal),
        discountAmount: new Prisma.Decimal(computed.discountAmount),
        gstAmount: new Prisma.Decimal(computed.gstAmount),
        totalAmount: new Prisma.Decimal(computed.totalAmount),
        estimatedCost: new Prisma.Decimal(computed.estimatedCost),
        profitAmount: new Prisma.Decimal(computed.profitAmount),
        marginPercent: new Prisma.Decimal(computed.marginPercent ?? 0),
        notes: `Draft created from site visit ${visit.id}.` as string,
        internalNotes:
          [
            `Site visit ${visit.id} (${visit.scheduledAt.toISOString()})`,
            visit.notes ? `Visit notes:\n${visit.notes}` : null,
          ]
            .filter((x): x is string => Boolean(x))
            .join("\n\n") || null,
        sections: {
          create: builderSections.map((section, sectionIndex) => ({
            category: section.category as ScopeCategory,
            title: section.title,
            description: section.description ?? null,
            isIncluded: section.isIncluded,
            isOptional: section.isOptional,
            remarks: section.remarks ?? null,
            sortOrder: sectionIndex,
            subtotal: new Prisma.Decimal(computed.sections[sectionIndex]?.subtotal ?? 0),
            lineItems: {
              create: section.lineItems.map((item, itemIndex) => {
                const computedItem = computed.sections[sectionIndex]?.lineItems[itemIndex];
                return {
                  itemMasterId: null,
                  unitOfMeasureId: null,
                  sku: item.sku,
                  itemType: item.itemType as LineItemType,
                  description: item.description,
                  specification: item.specification ?? null,
                  unit: item.unit,
                  quantity: new Prisma.Decimal(item.quantity),
                  unitPrice: new Prisma.Decimal(item.unitPrice),
                  costPrice: new Prisma.Decimal(item.costPrice),
                  totalPrice: new Prisma.Decimal(computedItem?.totalPrice ?? 0),
                  totalCost: new Prisma.Decimal(computedItem?.totalCost ?? 0),
                  profit: new Prisma.Decimal(computedItem?.profit ?? 0),
                  marginPercent: new Prisma.Decimal(computedItem?.marginPercent ?? 0),
                  remarks: item.remarks ?? null,
                  isIncluded: item.isIncluded,
                  isOptional: item.isOptional,
                  sortOrder: itemIndex,
                };
              }),
            },
          })),
        },
      },
    });

    return quotation;
  });

  await recomputeQuotationDerivedTotals({ quotationId: created.id });

  await auditLog({
    module: "quotation",
    action: "create_from_site_visit",
    actorUserId: user.id,
    projectId,
    entityType: "Quotation",
    entityId: created.id,
    metadata: { siteVisitId: visit.id, quotationNumber: created.quotationNumber },
  });

  revalidatePath(`/projects/${projectId}/quotations`);
  redirect(`/projects/${projectId}/quotations/${created.id}/edit`);
}
