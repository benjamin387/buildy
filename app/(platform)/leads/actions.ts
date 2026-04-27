"use server";

import { z } from "zod";
import {
  CommunicationChannel,
  AISalesStatus,
  LeadActivityType,
  LeadSource,
  LeadStatus,
  MessageChannel,
  Permission,
  PropertyType,
  ProjectStatus,
  type CondoType,
  type DesignStyle,
  type HdbType,
  type LandedType,
  type ProjectType,
  type PropertyCategory,
  type ResidentialPropertyType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { addLeadActivity, createLead, getLeadByIdForViewer, updateLead } from "@/lib/leads/service";
import { createProject } from "@/lib/projects/service";
import { auditLog, createRevision } from "@/lib/audit";
import { toRevisionJson } from "@/lib/audit/serialize";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  analyzeLeadQuality,
  generateCustomerFollowUp,
  generateObjectionHandlingReply,
  summarizeClientRequirement,
  suggestSalesNextAction,
} from "@/lib/ai/sales-assistant";
import { runAIAction } from "@/lib/ai/action-runner";
import { requireLeadSubmissionAccess } from "@/lib/leads/access";
import { normalizePhoneNumber } from "@/lib/validation/phone";
import { sendEmail } from "@/lib/messaging/email";
import { sendWhatsApp } from "@/lib/messaging/whatsapp";

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

function mapLeadToProjectPropertyType(lead: {
  propertyCategory: PropertyCategory;
  residentialPropertyType: ResidentialPropertyType | null;
}): "HDB" | "CONDO" | "LANDED" | "COMMERCIAL" | "OTHER" {
  if (lead.propertyCategory === "COMMERCIAL") return "COMMERCIAL";
  if (lead.residentialPropertyType === "HDB") return "HDB";
  if (lead.residentialPropertyType === "CONDO") return "CONDO";
  if (lead.residentialPropertyType === "LANDED") return "LANDED";
  return "OTHER";
}

const leadSchema = z.object({
  leadNumber: z.string().optional().or(z.literal("")).default(""),
  customerName: z.string().min(1).max(140),
  customerEmail: z.string().email().optional().or(z.literal("")).default(""),
  customerPhone: z.string().optional().or(z.literal("")).default(""),
  marketingSource: z.string().optional().or(z.literal("")).default(""),
  status: z.nativeEnum(LeadStatus).optional().default(LeadStatus.NEW),
  assignedSalesName: z.string().optional().or(z.literal("")).default(""),
  assignedSalesEmail: z.string().email().optional().or(z.literal("")).default(""),
  projectAddress: z.string().min(1).max(280),
  projectType: z.enum(["RESIDENTIAL", "COMMERCIAL"]).default("RESIDENTIAL"),
  propertyType: z.nativeEnum(PropertyType).optional().or(z.literal("")).default(""),
  propertyAddress: z.string().optional().or(z.literal("")).default(""),
  estimatedBudget: z.string().optional().or(z.literal("")).default(""),
  preferredStartDate: z.string().optional().or(z.literal("")).default(""),
  remarks: z.string().optional().or(z.literal("")).default(""),
  propertyCategory: z.enum(["RESIDENTIAL", "COMMERCIAL"]).default("RESIDENTIAL"),
  residentialPropertyType: z.enum(["HDB", "CONDO", "LANDED"]).optional().or(z.literal("")).default(""),
  hdbType: z
    .enum(["ONE_ROOM", "TWO_ROOM", "THREE_ROOM", "FOUR_ROOM", "FIVE_ROOM", "EXECUTIVE", "JUMBO"])
    .optional()
    .or(z.literal(""))
    .default(""),
  condoType: z
    .enum(["CONDOMINIUM", "APARTMENT", "WALK_UP", "CLUSTER_HOUSE", "EXECUTIVE_CONDOMINIUM"])
    .optional()
    .or(z.literal(""))
    .default(""),
  landedType: z
    .enum([
      "TERRACED_HOUSE",
      "DETACHED_HOUSE",
      "SEMI_DETACHED_HOUSE",
      "CORNER_TERRACE",
      "BUNGALOW_HOUSE",
      "GOOD_CLASS_BUNGALOW",
      "SHOPHOUSE",
      "LAND_ONLY",
      "TOWN_HOUSE",
      "CONSERVATION_HOUSE",
      "CLUSTER_HOUSE",
    ])
    .optional()
    .or(z.literal(""))
    .default(""),
  preferredDesignStyle: z
    .enum(["MODERN", "MINIMALIST", "INDUSTRIAL", "SCANDINAVIAN", "CONTEMPORARY", "OTHERS"])
    .optional()
    .or(z.literal(""))
    .default(""),
  requirementSummary: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
  nextFollowUpAt: z.string().optional().or(z.literal("")).default(""),
});

export async function createLeadAction(formData: FormData) {
  const user = await requireUser();
  requireLeadSubmissionAccess(user);

  const parsed = leadSchema.safeParse({
    leadNumber: formData.get("leadNumber"),
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    marketingSource: formData.get("marketingSource"),
    status: formData.get("status"),
    assignedSalesName: formData.get("assignedSalesName"),
    assignedSalesEmail: formData.get("assignedSalesEmail"),
    projectAddress: formData.get("projectAddress"),
    projectType: formData.get("projectType"),
    propertyType: formData.get("propertyType"),
    propertyAddress: formData.get("propertyAddress"),
    estimatedBudget: formData.get("estimatedBudget"),
    preferredStartDate: formData.get("preferredStartDate"),
    remarks: formData.get("remarks"),
    propertyCategory: formData.get("propertyCategory"),
    residentialPropertyType: formData.get("residentialPropertyType"),
    hdbType: formData.get("hdbType"),
    condoType: formData.get("condoType"),
    landedType: formData.get("landedType"),
    preferredDesignStyle: formData.get("preferredDesignStyle"),
    requirementSummary: formData.get("requirementSummary"),
    notes: formData.get("notes"),
    nextFollowUpAt: formData.get("nextFollowUpAt"),
  });
  if (!parsed.success) throw new Error("Invalid lead input.");

  const customerPhone = normalizePhoneNumber(parsed.data.customerPhone);
  if (!customerPhone) {
    throw new Error("Customer phone is required (use +65… format).");
  }

  const lead = await createLead({
    leadNumber: parsed.data.leadNumber || undefined,
    customerName: parsed.data.customerName,
    customerEmail: parsed.data.customerEmail ? parsed.data.customerEmail.toLowerCase() : null,
    customerPhone,
    source: LeadSource.MANUAL,
    marketingSource: parsed.data.marketingSource || null,
    status: LeadStatus.NEW,
    assignedSalesName: parsed.data.assignedSalesName || null,
    assignedSalesEmail: parsed.data.assignedSalesEmail ? parsed.data.assignedSalesEmail.toLowerCase() : null,
    submittedByUserId: user.id,
    projectAddress: parsed.data.projectAddress,
    projectType: parsed.data.projectType as ProjectType,
    propertyType: parsed.data.propertyType ? (parsed.data.propertyType as PropertyType) : null,
    propertyAddress: parsed.data.propertyAddress || null,
    estimatedBudget: parsed.data.estimatedBudget ? parsed.data.estimatedBudget : null,
    preferredStartDate: parsed.data.preferredStartDate ? toDate(parsed.data.preferredStartDate) : null,
    remarks: parsed.data.remarks || null,
    propertyCategory: parsed.data.propertyCategory as PropertyCategory,
    residentialPropertyType: parsed.data.residentialPropertyType
      ? (parsed.data.residentialPropertyType as ResidentialPropertyType)
      : null,
    hdbType: parsed.data.hdbType ? (parsed.data.hdbType as HdbType) : null,
    condoType: parsed.data.condoType ? (parsed.data.condoType as CondoType) : null,
    landedType: parsed.data.landedType ? (parsed.data.landedType as LandedType) : null,
    preferredDesignStyle: parsed.data.preferredDesignStyle ? (parsed.data.preferredDesignStyle as DesignStyle) : null,
    requirementSummary: parsed.data.requirementSummary || null,
    notes: parsed.data.notes || null,
    nextFollowUpAt: parsed.data.nextFollowUpAt ? toDate(parsed.data.nextFollowUpAt) : null,
  });

  await addLeadActivity({
    leadId: lead.id,
    activityType: "NOTE",
    channel: "OTHER",
    summary: "Lead created",
    notes: null,
    followUpAt: lead.nextFollowUpAt,
    createdBy: user.email,
  });

  await auditLog({
    module: "lead",
    action: "create",
    actorUserId: user.id,
    projectId: null,
    entityType: "Lead",
    entityId: lead.id,
    metadata: { leadNumber: lead.leadNumber, status: lead.status },
  });
  await createRevision({
    entityType: "Lead",
    entityId: lead.id,
    projectId: null,
    actorUserId: user.id,
    note: "Lead created",
    data: toRevisionJson(lead),
  });

  // Auto-draft a WhatsApp-first follow-up message for sales (never auto-sends).
  try {
    await runAIAction({
      action: "SEND_FIRST_CONTACT_MESSAGE",
      entityType: "LEAD",
      entityId: lead.id,
      priority: "HIGH",
      confidence: 0.9,
      reason: "New lead created: draft first contact message for follow-up (WhatsApp-first).",
      metadata: { trigger: "lead_created", createdByUserId: user.id },
    });
  } catch {
    // Best-effort: do not block lead creation UX.
  }

  revalidatePath("/leads");
  redirect(`/leads/${lead.id}`);
}

export async function updateLeadAction(formData: FormData) {
  const user = await requireUser();

  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) throw new Error("Missing lead.");

  const parsed = leadSchema.safeParse({
    leadNumber: formData.get("leadNumber"),
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    marketingSource: formData.get("marketingSource"),
    status: formData.get("status"),
    assignedSalesName: formData.get("assignedSalesName"),
    assignedSalesEmail: formData.get("assignedSalesEmail"),
    projectAddress: formData.get("projectAddress"),
    projectType: formData.get("projectType"),
    propertyType: formData.get("propertyType"),
    propertyAddress: formData.get("propertyAddress"),
    estimatedBudget: formData.get("estimatedBudget"),
    preferredStartDate: formData.get("preferredStartDate"),
    remarks: formData.get("remarks"),
    propertyCategory: formData.get("propertyCategory"),
    residentialPropertyType: formData.get("residentialPropertyType"),
    hdbType: formData.get("hdbType"),
    condoType: formData.get("condoType"),
    landedType: formData.get("landedType"),
    preferredDesignStyle: formData.get("preferredDesignStyle"),
    requirementSummary: formData.get("requirementSummary"),
    notes: formData.get("notes"),
    nextFollowUpAt: formData.get("nextFollowUpAt"),
  });
  if (!parsed.success) throw new Error("Invalid lead input.");

  const existing = await getLeadByIdForViewer({ viewer: user, leadId });
  if (!existing) throw new Error("Lead not found.");

  if (existing.status === "CONVERTED" || existing.status === "LOST") {
    // Still allow edits for reference, but keep status.
  }

  const customerPhone = normalizePhoneNumber(parsed.data.customerPhone) ?? null;

  const updated = await updateLead({
    leadId,
    leadNumber: parsed.data.leadNumber || undefined,
    customerName: parsed.data.customerName,
    customerEmail: parsed.data.customerEmail ? parsed.data.customerEmail.toLowerCase() : null,
    customerPhone,
    marketingSource: parsed.data.marketingSource || null,
    status: parsed.data.status,
    assignedSalesName: parsed.data.assignedSalesName || null,
    assignedSalesEmail: parsed.data.assignedSalesEmail ? parsed.data.assignedSalesEmail.toLowerCase() : null,
    projectAddress: parsed.data.projectAddress,
    projectType: parsed.data.projectType as ProjectType,
    propertyType: parsed.data.propertyType ? (parsed.data.propertyType as PropertyType) : null,
    propertyAddress: parsed.data.propertyAddress || null,
    estimatedBudget: parsed.data.estimatedBudget ? parsed.data.estimatedBudget : null,
    preferredStartDate: parsed.data.preferredStartDate ? toDate(parsed.data.preferredStartDate) : null,
    remarks: parsed.data.remarks || null,
    propertyCategory: parsed.data.propertyCategory as PropertyCategory,
    residentialPropertyType: parsed.data.residentialPropertyType
      ? (parsed.data.residentialPropertyType as ResidentialPropertyType)
      : null,
    hdbType: parsed.data.hdbType ? (parsed.data.hdbType as HdbType) : null,
    condoType: parsed.data.condoType ? (parsed.data.condoType as CondoType) : null,
    landedType: parsed.data.landedType ? (parsed.data.landedType as LandedType) : null,
    preferredDesignStyle: parsed.data.preferredDesignStyle ? (parsed.data.preferredDesignStyle as DesignStyle) : null,
    requirementSummary: parsed.data.requirementSummary || null,
    notes: parsed.data.notes || null,
    nextFollowUpAt: parsed.data.nextFollowUpAt ? toDate(parsed.data.nextFollowUpAt) : null,
  });

  await auditLog({
    module: "lead",
    action: "update",
    actorUserId: user.id,
    projectId: null,
    entityType: "Lead",
    entityId: updated.id,
    metadata: { leadNumber: updated.leadNumber, status: updated.status },
  });
  await createRevision({
    entityType: "Lead",
    entityId: updated.id,
    projectId: null,
    actorUserId: user.id,
    note: "Lead updated",
    data: toRevisionJson(updated),
  });

  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}`);
}

const activitySchema = z.object({
  leadId: z.string().min(1),
  activityType: z.nativeEnum(LeadActivityType),
  channel: z.nativeEnum(CommunicationChannel),
  summary: z.string().min(1).max(240),
  notes: z.string().optional().or(z.literal("")).default(""),
  followUpAt: z.string().optional().or(z.literal("")).default(""),
});

export async function addLeadActivityAction(formData: FormData) {
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = activitySchema.safeParse({
    leadId: formData.get("leadId"),
    activityType: formData.get("activityType"),
    channel: formData.get("channel"),
    summary: formData.get("summary"),
    notes: formData.get("notes"),
    followUpAt: formData.get("followUpAt"),
  });
  if (!parsed.success) throw new Error("Invalid activity.");

  const act = await addLeadActivity({
    leadId: parsed.data.leadId,
    activityType: parsed.data.activityType,
    channel: parsed.data.channel,
    summary: parsed.data.summary,
    notes: parsed.data.notes || null,
    followUpAt: parsed.data.followUpAt ? toDate(parsed.data.followUpAt) : null,
    createdBy: user.email,
  });

  await auditLog({
    module: "lead",
    action: "activity",
    actorUserId: user.id,
    projectId: null,
    entityType: "LeadActivity",
    entityId: act.id,
    metadata: { leadId: parsed.data.leadId, activityType: act.activityType },
  });

  revalidatePath(`/leads/${parsed.data.leadId}`);
  redirect(`/leads/${parsed.data.leadId}`);
}

const lostSchema = z.object({
  leadId: z.string().min(1),
  reason: z.string().min(1).max(240),
});

export async function markLeadLostAction(formData: FormData) {
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = lostSchema.safeParse({
    leadId: formData.get("leadId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) throw new Error("Lead not found.");

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: { status: "LOST", nextFollowUpAt: null },
    });
    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        activityType: "LOST_REASON",
        channel: "OTHER",
        summary: "Lead marked lost",
        notes: parsed.data.reason,
        followUpAt: null,
        createdBy: user.email,
      },
    });
  });

  await auditLog({
    module: "lead",
    action: "lost",
    actorUserId: user.id,
    projectId: null,
    entityType: "Lead",
    entityId: lead.id,
    metadata: { leadNumber: lead.leadNumber, reason: parsed.data.reason },
  });

  revalidatePath(`/leads/${lead.id}`);
  redirect(`/leads/${lead.id}`);
}

const convertSchema = z.object({
  leadId: z.string().min(1),
});

async function ensureProjectFromLead(params: { leadId: string; actor: { id: string; email: string } }) {
  const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
  if (!lead) throw new Error("Lead not found.");
  if (lead.convertedProjectId) {
    return { lead, projectId: lead.convertedProjectId, created: false };
  }
  if (lead.status === "LOST") throw new Error("Cannot convert a lost lead.");

  const propertyType = mapLeadToProjectPropertyType({
    propertyCategory: lead.propertyCategory,
    residentialPropertyType: lead.residentialPropertyType,
  });

  const { project } = await createProject({
    projectCode: undefined,
    name: lead.customerName ? `${lead.customerName} Project` : "New Project",
    projectType: lead.projectType,
    status: ProjectStatus.LEAD,
    clientName: lead.customerName,
    clientCompany: null,
    clientEmail: lead.customerEmail ?? null,
    clientPhone: lead.customerPhone ?? null,
    siteAddress: lead.projectAddress,
    startDate: null,
    targetCompletionDate: null,
    actualCompletionDate: null,
    contractValue: 0,
    revisedContractValue: 0,
    estimatedCost: 0,
    committedCost: 0,
    actualCost: 0,
    notes:
      [
        lead.requirementSummary ? `Requirements: ${lead.requirementSummary}` : null,
        lead.preferredDesignStyle ? `Design style: ${lead.preferredDesignStyle}` : null,
        lead.notes ? `Lead notes: ${lead.notes}` : null,
      ]
        .filter((x): x is string => Boolean(x))
        .join("\n") || null,
    addressLine1: lead.projectAddress,
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
      await tx.projectCommercialProfile.create({
        data: { projectId: project.id, status: "LEAD" },
      });
    }

    await tx.projectTimelineItem.create({
      data: {
        projectId: project.id,
        type: "NOTE",
        title: "Lead converted to project",
        description: `Converted from lead ${lead.leadNumber}`,
        createdById: params.actor.id,
        metadata: { leadId: lead.id, leadNumber: lead.leadNumber },
      },
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: "CONVERTED",
        convertedProjectId: project.id,
        convertedAt: new Date(),
        nextFollowUpAt: null,
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        activityType: "NOTE",
        channel: "OTHER",
        summary: "Converted to project",
        notes: `Project ${project.projectCode ?? project.id.slice(0, 8)} created.`,
        followUpAt: null,
        createdBy: params.actor.email,
      },
    });
  });

  return { lead, projectId: project.id, created: true };
}

export async function convertLeadToProjectAction(formData: FormData) {
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = convertSchema.safeParse({
    leadId: formData.get("leadId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { lead, projectId, created } = await ensureProjectFromLead({
    leadId: parsed.data.leadId,
    actor: { id: user.id, email: user.email },
  });

  await auditLog({
    module: "lead",
    action: "convert_to_project",
    actorUserId: user.id,
    projectId,
    entityType: "Lead",
    entityId: lead.id,
    metadata: { leadNumber: lead.leadNumber, projectId, created },
  });

  revalidatePath("/leads");
  redirect(`/projects/${projectId}`);
}

export async function convertLeadToQuotationAction(formData: FormData) {
  const user = await requireUser();

  const parsed = convertSchema.safeParse({
    leadId: formData.get("leadId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) throw new Error("Lead not found.");
  if (lead.status === "LOST") throw new Error("Cannot create quotation for a lost lead.");

  let projectId = lead.convertedProjectId ?? null;

  if (!projectId) {
    await requirePermission({ permission: Permission.PROJECT_WRITE });
    const ensured = await ensureProjectFromLead({
      leadId: lead.id,
      actor: { id: user.id, email: user.email },
    });
    projectId = ensured.projectId;

    await auditLog({
      module: "lead",
      action: "convert_to_project",
      actorUserId: user.id,
      projectId,
      entityType: "Lead",
      entityId: lead.id,
      metadata: { leadNumber: lead.leadNumber, projectId, created: ensured.created, reason: "quotation_entrypoint" },
    });

    revalidatePath("/leads");
  }

  await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  // Redirect into the quotation builder. It will enforce quotation creation rules (sections/items required).
  redirect(`/projects/${projectId}/quotations/new`);
}

const aiLeadSchema = z.object({
  leadId: z.string().min(1),
});

function assertAISalesEnabled() {
  const prismaAny = prisma as unknown as Record<string, any>;
  if (typeof prismaAny.aISalesInsight?.createMany !== "function") {
    throw new Error(
      "AI Sales Assistant tables are not available in the running server. If you just updated Prisma, run prisma generate and restart the server.",
    );
  }
  if (typeof prismaAny.aISalesMessageDraft?.create !== "function") {
    throw new Error(
      "AI Sales Assistant tables are not available in the running server. If you just updated Prisma, run prisma generate and restart the server.",
    );
  }
}

export async function generateLeadAnalysisAction(formData: FormData) {
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE });
  assertAISalesEnabled();

  const parsed = aiLeadSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) throw new Error("Invalid lead.");

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    include: { activities: { orderBy: [{ createdAt: "desc" }], take: 200 } },
  });
  if (!lead) throw new Error("Lead not found.");

  const lastActivityAt = lead.activities[0]?.createdAt ?? null;
  const siteVisitCount = await prisma.siteVisit.count({
    where: { leadId: lead.id },
  });

	  const ctx = {
	    leadNumber: lead.leadNumber,
	    customerName: lead.customerName,
	    customerEmail: lead.customerEmail ?? null,
	    customerPhone: lead.customerPhone ?? null,
	    source: lead.source.toString(),
	    status: lead.status,
	    projectType: lead.projectType,
	    propertyCategory: lead.propertyCategory,
	    projectAddress: lead.projectAddress,
	    preferredDesignStyle: lead.preferredDesignStyle ?? null,
    requirementSummary: lead.requirementSummary ?? null,
    notes: lead.notes ?? null,
    nextFollowUpAt: lead.nextFollowUpAt ?? null,
    lastActivityAt,
    hasSiteVisitScheduled: siteVisitCount > 0 || lead.status === "SITE_VISIT_SCHEDULED",
  } as const;

  const [quality, nextAction, reqSummary] = await Promise.all([
    analyzeLeadQuality(ctx),
    suggestSalesNextAction(ctx),
    summarizeClientRequirement({
      requirementSummary: ctx.requirementSummary,
      notes: ctx.notes,
      preferredDesignStyle: ctx.preferredDesignStyle,
      address: ctx.projectAddress,
    }),
  ]);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.aISalesInsight.createMany({
      data: [
        {
          leadId: lead.id,
          projectId: null,
          insightType: "LEAD_QUALITY",
          title: `Lead quality: ${quality.qualityScore}/100`,
          summary: [
            `Score: ${quality.qualityScore}/100`,
            `Budget readiness: ${quality.budgetReadiness}`,
            quality.highValueFlag ? "High value flag: Commercial" : null,
            "",
            "Reasons:",
            ...quality.reasons.map((r) => `- ${r}`),
            "",
            quality.missingInfo.length ? "Missing info:" : null,
            ...quality.missingInfo.map((m) => `- ${m}`),
          ]
            .filter((x): x is string => Boolean(x))
            .join("\n"),
          recommendation: nextAction.recommendation,
          confidenceScore: quality.confidenceScore,
          status: "DRAFT",
          createdAt: now,
          updatedAt: now,
        },
        {
          leadId: lead.id,
          projectId: null,
          insightType: "REQUIREMENT_SUMMARY",
          title: "Client requirement summary",
          summary: reqSummary,
          recommendation: "Confirm budget range, timeline, and must-haves vs optional scope before quoting.",
          confidenceScore: Math.max(0.4, quality.confidenceScore),
          status: "DRAFT",
          createdAt: now,
          updatedAt: now,
        },
        {
          leadId: lead.id,
          projectId: null,
          insightType: "NEXT_ACTION",
          title: nextAction.title,
          summary: `Due: ${nextAction.dueLabel}\nChannel: ${nextAction.suggestedChannel}`,
          recommendation: nextAction.recommendation,
          confidenceScore: Math.max(0.4, quality.confidenceScore),
          status: "DRAFT",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "generate_lead_analysis",
    actorUserId: user.id,
    projectId: null,
    entityType: "Lead",
    entityId: lead.id,
    metadata: { leadNumber: lead.leadNumber, score: quality.qualityScore, confidence: quality.confidenceScore },
  });

  revalidatePath(`/leads/${lead.id}`);
  redirect(`/leads/${lead.id}#ai`);
}

const aiFollowUpSchema = z.object({
  leadId: z.string().min(1),
  channel: z.nativeEnum(MessageChannel),
  purpose: z
    .enum([
      "FIRST_CONTACT",
      "SITE_VISIT_BOOKING",
      "QUOTATION_FOLLOW_UP",
      "PRESENTATION_FOLLOW_UP",
      "PAYMENT_REMINDER",
      "UPSELL_PROPOSAL",
    ])
    .optional(),
});

type FollowUpPurpose =
  | "FIRST_CONTACT"
  | "SITE_VISIT_BOOKING"
  | "QUOTATION_FOLLOW_UP"
  | "PRESENTATION_FOLLOW_UP"
  | "PAYMENT_REMINDER"
  | "UPSELL_PROPOSAL";

function defaultPurpose(status: LeadStatus): FollowUpPurpose {
  if (status === "NEW") return "FIRST_CONTACT";
  if (status === "CONTACTED" || status === "QUALIFYING") return "SITE_VISIT_BOOKING";
  if (status === "SITE_VISIT_SCHEDULED") return "SITE_VISIT_BOOKING";
  if (status === "QUOTATION_PENDING") return "QUOTATION_FOLLOW_UP";
  return "FIRST_CONTACT";
}

export async function generateLeadFollowUpDraftAction(formData: FormData) {
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE });
  assertAISalesEnabled();

  const parsed = aiFollowUpSchema.safeParse({
    leadId: formData.get("leadId"),
    channel: formData.get("channel"),
    purpose: formData.get("purpose"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    include: { activities: { orderBy: [{ createdAt: "desc" }], take: 50 } },
  });
  if (!lead) throw new Error("Lead not found.");

	  const ctx = {
	    leadNumber: lead.leadNumber,
	    customerName: lead.customerName,
	    customerEmail: lead.customerEmail ?? null,
	    customerPhone: lead.customerPhone ?? null,
	    source: lead.source.toString(),
	    status: lead.status,
	    projectType: lead.projectType,
	    propertyCategory: lead.propertyCategory,
	    projectAddress: lead.projectAddress,
	    preferredDesignStyle: lead.preferredDesignStyle ?? null,
    requirementSummary: lead.requirementSummary ?? null,
    notes: lead.notes ?? null,
    nextFollowUpAt: lead.nextFollowUpAt ?? null,
    lastActivityAt: lead.activities[0]?.createdAt ?? null,
    hasSiteVisitScheduled: lead.status === "SITE_VISIT_SCHEDULED",
  } as const;

  const draft = await generateCustomerFollowUp({
    lead: ctx,
    channel: parsed.data.channel,
    purpose: (parsed.data.purpose ?? defaultPurpose(lead.status)) as FollowUpPurpose,
  });

  await prisma.aISalesMessageDraft.create({
    data: {
      leadId: lead.id,
      projectId: null,
      channel: draft.channel,
      recipientName: draft.recipientName,
      recipientContact: draft.recipientContact,
      purpose: draft.purpose,
      messageBody: draft.messageBody,
      status: "DRAFT",
    },
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "generate_follow_up_draft",
    actorUserId: user.id,
    projectId: null,
    entityType: "Lead",
    entityId: lead.id,
    metadata: { channel: draft.channel, purpose: draft.purpose },
  });

  revalidatePath(`/leads/${lead.id}`);
  redirect(`/leads/${lead.id}#ai`);
}

const aiObjectionSchema = z.object({
  leadId: z.string().min(1),
  channel: z.nativeEnum(MessageChannel),
  objectionText: z.string().min(3).max(600),
});

export async function generateLeadObjectionReplyDraftAction(formData: FormData) {
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE });
  assertAISalesEnabled();

  const parsed = aiObjectionSchema.safeParse({
    leadId: formData.get("leadId"),
    channel: formData.get("channel"),
    objectionText: formData.get("objectionText"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) throw new Error("Lead not found.");

  const reply = await generateObjectionHandlingReply({
    clientName: lead.customerName ?? null,
    objectionText: parsed.data.objectionText,
    channel: parsed.data.channel,
  });

  await prisma.aISalesMessageDraft.create({
    data: {
      leadId: lead.id,
      projectId: null,
      channel: parsed.data.channel,
      recipientName: lead.customerName ?? null,
      recipientContact: parsed.data.channel === "EMAIL" ? (lead.customerEmail ?? null) : (lead.customerPhone ?? null),
      purpose: "OBJECTION_HANDLING",
      messageBody: reply.messageBody,
      status: "DRAFT",
    },
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "generate_objection_reply",
    actorUserId: user.id,
    projectId: null,
    entityType: "Lead",
    entityId: lead.id,
    metadata: { channel: parsed.data.channel },
  });

  revalidatePath(`/leads/${lead.id}`);
  redirect(`/leads/${lead.id}#ai`);
}

const aiUpdateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(AISalesStatus),
  leadId: z.string().optional().or(z.literal("")).default(""),
});

export async function updateAISalesInsightStatusAction(formData: FormData) {
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE });
  assertAISalesEnabled();

  const parsed = aiUpdateStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    leadId: formData.get("leadId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await prisma.aISalesInsight.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "update_insight_status",
    actorUserId: user.id,
    projectId: null,
    entityType: "AISalesInsight",
    entityId: parsed.data.id,
    metadata: { status: parsed.data.status },
  });

  if (parsed.data.leadId) {
    revalidatePath(`/leads/${parsed.data.leadId}`);
    redirect(`/leads/${parsed.data.leadId}#ai`);
  }
  redirect("/leads");
}

export async function updateAISalesMessageDraftStatusAction(formData: FormData) {
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE });
  assertAISalesEnabled();

  const parsed = aiUpdateStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    leadId: formData.get("leadId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await prisma.aISalesMessageDraft.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "update_message_draft_status",
    actorUserId: user.id,
    projectId: null,
    entityType: "AISalesMessageDraft",
    entityId: parsed.data.id,
    metadata: { status: parsed.data.status },
  });

  if (parsed.data.leadId) {
    revalidatePath(`/leads/${parsed.data.leadId}`);
    redirect(`/leads/${parsed.data.leadId}#ai`);
  }
  redirect("/leads");
}

const aiSendDraftSchema = z.object({
  id: z.string().min(1),
  leadId: z.string().min(1),
  returnTo: z.string().min(1),
});

export async function sendAISalesMessageDraftAction(formData: FormData) {
  const user = await requireUser();
  await requirePermission({ permission: Permission.COMMS_WRITE });
  assertAISalesEnabled();

  const parsed = aiSendDraftSchema.safeParse({
    id: formData.get("id"),
    leadId: formData.get("leadId"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) throw new Error("Invalid send request.");

  const draft = await prisma.aISalesMessageDraft.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      leadId: true,
      channel: true,
      recipientName: true,
      recipientContact: true,
      messageBody: true,
      status: true,
      purpose: true,
    },
  });
  if (!draft || draft.leadId !== parsed.data.leadId) throw new Error("Message draft not found.");
  if (draft.status !== AISalesStatus.APPROVED) throw new Error("Draft must be approved before sending.");

  const recipient = (draft.recipientContact ?? "").trim();
  if (!recipient) throw new Error("Missing recipient contact.");

  const body = draft.messageBody.trim();
  if (!body) throw new Error("Message body is empty.");

  const now = new Date();
  const providerMessageId =
    draft.channel === MessageChannel.EMAIL
      ? (
          await sendEmail({
            to: recipient,
            toName: draft.recipientName ?? null,
            subject: `Lead follow-up (${draft.purpose})`,
            text: body,
            html: null,
          })
        ).providerMessageId
      : (
          await sendWhatsApp({
            to: recipient,
            toName: draft.recipientName ?? null,
            body,
          })
        ).providerMessageId;

  await prisma.aISalesMessageDraft.update({
    where: { id: draft.id },
    data: { status: AISalesStatus.SENT },
  });

  await addLeadActivity({
    leadId: parsed.data.leadId,
    activityType: draft.channel === MessageChannel.EMAIL ? LeadActivityType.EMAIL : LeadActivityType.WHATSAPP,
    channel: draft.channel === MessageChannel.EMAIL ? CommunicationChannel.EMAIL : CommunicationChannel.WHATSAPP,
    summary: `Sent AI draft via ${draft.channel}`,
    notes: body,
    followUpAt: null,
    createdBy: user.email,
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "send_message_draft",
    actorUserId: user.id,
    projectId: null,
    entityType: "AISalesMessageDraft",
    entityId: draft.id,
    metadata: { channel: draft.channel, providerMessageId, sentAt: now.toISOString() },
  });

  revalidatePath(`/leads/${parsed.data.leadId}`);
  redirect(parsed.data.returnTo);
}

const quickUpdateSchema = z.object({
  leadId: z.string().min(1),
  status: z.nativeEnum(LeadStatus).optional(),
  assignedToUserId: z.string().optional().or(z.literal("")).default(""),
});

export async function quickUpdateLeadAction(formData: FormData) {
  const user = await requireUser();

  const parsed = quickUpdateSchema.safeParse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
    assignedToUserId: formData.get("assignedToUserId"),
  });
  if (!parsed.success) throw new Error("Invalid update.");

  const existing = await getLeadByIdForViewer({ viewer: user, leadId: parsed.data.leadId });
  if (!existing) throw new Error("Lead not found.");

  const canAssign = user.isAdmin || user.roleKeys.includes("DIRECTOR");
  const assignedToUserId = parsed.data.assignedToUserId.trim() ? parsed.data.assignedToUserId.trim() : null;

  await prisma.lead.update({
    where: { id: parsed.data.leadId },
    data: {
      status: parsed.data.status ?? undefined,
      assignedToUserId: canAssign ? assignedToUserId : undefined,
    },
  });

  revalidatePath("/leads");
  redirect("/leads");
}
