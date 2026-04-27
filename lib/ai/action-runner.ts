import "server-only";

import { AIActionStatus, Prisma, UpsellPriority, UpsellStatus, VisualGenerationStatus, type Lead, type Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateCustomerFollowUp, type LeadContext } from "@/lib/ai/sales-assistant";
import { syncCollectionCaseForInvoice } from "@/lib/collections/service";
import { runDesignToSalesPipeline } from "@/lib/pipeline/design-to-sales";
import type { RunAIActionInput, AIActionName, AIEntityType } from "@/lib/ai/action-types";
import type { AIAutomationModeKey } from "@/lib/ai/action-permissions";
import { createAIActionLog, getAIActionLogById, updateAIActionLog } from "@/lib/ai/action-log";
import { createTask } from "@/lib/projects/service";
import { auditLog } from "@/lib/audit";
import { buildInteriorVisualPrompt, generateInteriorVisual } from "@/lib/ai/visual-generator";
import { generateUpsellRecommendations } from "@/lib/ai/upsell-engine";
import { generateFurnitureLayout } from "@/lib/ai/layout-generator";
import { ensurePendingOutcomeForCompletedAction } from "@/lib/ai/learning-layer";
import { buildActionPolicy, DEFAULT_AI_AUTOMATION_SETTING } from "@/lib/ai/automation-policy";
import { getOrCreateAIAutomationSetting } from "@/lib/ai/automation-settings";

// ============================================================================
// AI Action Runner (approval-gated execution)
// ============================================================================

function parseAutomationModeFromEnv(): AIAutomationModeKey {
  const raw = (process.env.AI_AUTOMATION_MODE ?? "").trim().toUpperCase();
  if (raw === "ASSISTED") return "ASSISTED";
  if (raw === "AUTO_SAFE") return "AUTO_SAFE";
  if (raw === "AUTO_FULL") return "AUTO_FULL";
  return "MANUAL";
}

async function getAIAutomationSetting() {
  try {
    return await getOrCreateAIAutomationSetting();
  } catch {
    // If Prisma client hasn't been generated yet, default to manual safety.
    return null;
  }
}

function clamp01ForDecimal(n: number): Prisma.Decimal {
  const x = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  return new Prisma.Decimal(x);
}

function pickMessageChannel(params: { phone?: string | null; email?: string | null }) {
  const phone = (params.phone ?? "").trim();
  const email = (params.email ?? "").trim();
  if (phone) return { channel: "WHATSAPP" as const, address: phone };
  if (email) return { channel: "EMAIL" as const, address: email };
  return null;
}

async function buildLeadContextForAction(lead: Lead): Promise<LeadContext> {
  const lastActivity = await prisma.leadActivity.findFirst({
    where: { leadId: lead.id },
    orderBy: [{ createdAt: "desc" }],
    select: { createdAt: true },
  });

  const hasSiteVisitScheduled = Boolean(
    await prisma.siteVisit.findFirst({
      where: { leadId: lead.id, status: "SCHEDULED" },
      select: { id: true },
    }),
  );

  return {
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
    lastActivityAt: lastActivity?.createdAt ?? null,
    hasSiteVisitScheduled,
  };
}

async function handleSendLeadMessageDraft(params: {
  action: "SEND_FIRST_CONTACT_MESSAGE" | "SEND_FOLLOW_UP_MESSAGE";
  leadId: string;
}) {
  const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
  if (!lead) throw new Error("Lead not found.");

  const ctx = await buildLeadContextForAction(lead);
  const channel = (ctx.customerPhone ?? "").trim() ? "WHATSAPP" : (ctx.customerEmail ?? "").trim() ? "EMAIL" : null;
  if (!channel) {
    throw new Error("Lead has no phone/email to draft a message.");
  }

  const purpose = params.action === "SEND_FIRST_CONTACT_MESSAGE" ? "FIRST_CONTACT" : "SITE_VISIT_BOOKING";
  const draft = await generateCustomerFollowUp({
    lead: ctx,
    channel,
    purpose,
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

  return { ok: true as const, outcome: `Created ${channel} sales message draft (${purpose}).` };
}

async function handleRequestProgressUpdate(params: { projectId: string; reason: string }) {
  const project = await prisma.project.findUnique({ where: { id: params.projectId } });
  if (!project) throw new Error("Project not found.");

  await createTask({
    projectId: project.id,
    title: "Progress update required",
    description: `AI action: request progress update.\n\nReason: ${params.reason}`.trim(),
    roleResponsible: "PROJECT_MANAGER",
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    priority: "MEDIUM",
  });

  return { ok: true as const, outcome: "Created a project task to request a progress update." };
}

async function handleGenerateLayoutPlan(params: {
  areaId: string;
  title?: string | null;
  roomWidth?: number | null;
  roomLength?: number | null;
}) {
  const area = await prisma.designArea.findUnique({
    where: { id: params.areaId },
    include: {
      designBrief: { select: { id: true, projectId: true, clientNeeds: true, propertyType: true, designStyle: true } },
    },
  });
  if (!area) throw new Error("Design area not found.");

  const roomWidth = Number.isFinite(params.roomWidth ?? NaN) ? Math.max(0.1, Number(params.roomWidth)) : 3.5;
  const roomLength = Number.isFinite(params.roomLength ?? NaN) ? Math.max(0.1, Number(params.roomLength)) : 3.5;

  const layout = await generateFurnitureLayout({
    propertyType: area.designBrief.propertyType,
    roomType: area.roomType,
    roomWidth,
    roomLength,
    doorPosition: "Not specified",
    windowPosition: "Not specified",
    clientNeeds: [area.designBrief.clientNeeds, area.clientRequirement ?? ""].filter(Boolean).join("\n\n"),
    designStyle: area.designBrief.designStyle ?? null,
  });

  const title = params.title?.trim() ? params.title.trim() : `AI Layout Plan (${area.name})`;
  const created = await prisma.generatedLayoutPlan.create({
    data: {
      designAreaId: area.id,
      title,
      roomWidth: new Prisma.Decimal(roomWidth),
      roomLength: new Prisma.Decimal(roomLength),
      doorPosition: null,
      windowPosition: null,
      layoutSummary: layout.layoutSummary,
      furniturePlacementPlan: layout.furniturePlacementPlan,
      circulationNotes: layout.circulationNotes,
      constraints: layout.constraints,
      promptFor3DVisual: layout.promptFor3DVisual,
      isSelected: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    select: { id: true },
  });

  return { ok: true as const, outcome: `Generated layout plan ${created.id} for area ${area.name}.` };
}

async function handleGenerateVisualRender(params: { areaId: string; promptOverride?: string | null }) {
  const area = await prisma.designArea.findUnique({
    where: { id: params.areaId },
    include: { designBrief: { select: { id: true, projectId: true, designStyle: true } } },
  });
  if (!area) throw new Error("Design area not found.");

  const promptText = buildInteriorVisualPrompt({
    roomType: area.roomType,
    layoutNotes: area.proposedLayoutNotes ?? null,
    materials: area.proposedMaterials ?? null,
    designStyle: area.designBrief.designStyle ?? null,
    promptOverride: params.promptOverride?.trim() ? params.promptOverride.trim() : null,
  });

  const existingCount = await prisma.visualRender.count({ where: { designAreaId: area.id } });
  const title = `AI Render v${existingCount + 1}`;

  const created = await prisma.visualRender.create({
    data: {
      designAreaId: area.id,
      title,
      theme: area.proposedTheme ?? null,
      materialNotes: area.proposedMaterials ?? null,
      generatedPrompt: promptText,
      promptText,
      generationStatus: VisualGenerationStatus.PROCESSING,
      errorMessage: null,
    },
  });

  try {
    const result = await generateInteriorVisual({
      roomType: area.roomType,
      layoutNotes: area.proposedLayoutNotes ?? null,
      materials: area.proposedMaterials ?? null,
      designStyle: area.designBrief.designStyle ?? null,
      promptOverride: promptText,
    });

    await prisma.visualRender.update({
      where: { id: created.id },
      data: {
        promptText: result.promptText,
        generatedPrompt: result.promptText,
        generatedImageUrl: result.generatedImageUrl,
        fileUrl: result.generatedImageUrl,
        generationStatus: VisualGenerationStatus.COMPLETED,
        errorMessage: null,
      },
    });

    return { ok: true as const, outcome: `Generated 3D visual render ${created.id}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    await prisma.visualRender.update({
      where: { id: created.id },
      data: { generationStatus: VisualGenerationStatus.FAILED, errorMessage: message },
    });
    throw new Error(message);
  }
}

async function handleGenerateDesignVariations(params: { areaId: string }) {
  const outcomes: string[] = [];
  // Generate three options (A/B/C) using prompt suffixes.
  for (const suffix of ["Option A", "Option B", "Option C"]) {
    const r = await handleGenerateVisualRender({ areaId: params.areaId, promptOverride: suffix });
    outcomes.push(r.outcome);
  }
  return { ok: true as const, outcome: outcomes.join(" ") };
}

async function handleGenerateSalesPackage(params: { designBriefId: string }) {
  const brief = await prisma.designBrief.findUnique({ where: { id: params.designBriefId } });
  if (!brief) throw new Error("Design brief not found.");
  if (!brief.projectId) throw new Error("Design brief is not linked to a project.");

  const pipeline = await runDesignToSalesPipeline({
    projectId: brief.projectId,
    designBriefId: brief.id,
    regenerate: false,
  });

  if (!pipeline.ok) {
    throw new Error(`Pipeline validation failed: ${pipeline.validationErrors.join(" | ")}`);
  }

  return {
    ok: true as const,
    outcome: `Sales package generated (quotation: ${pipeline.quotationId ?? "-"}, presentation: ${pipeline.presentationId ?? "-"})`,
  };
}

async function handleGenerateUpsellRecommendations(params: { projectId?: string; designBriefId?: string }) {
  const projectId = params.projectId?.trim() || null;
  const briefId = params.designBriefId?.trim() || null;

  if (!projectId && !briefId) throw new Error("Missing projectId or designBriefId.");

  const brief = briefId
    ? await prisma.designBrief.findUnique({
        where: { id: briefId },
        include: { areas: { include: { qsBoqDraftItems: true } } },
      })
    : null;

  const project =
    projectId
      ? await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, propertyType: true, notes: true } })
      : brief?.projectId
        ? await prisma.project.findUnique({ where: { id: brief.projectId }, select: { id: true, propertyType: true, notes: true } })
        : null;

  if (!project) throw new Error("Project not found.");

  const currentBoqItems: Array<{ description: string }> = [];
  let currentBudget = 0;
  if (brief) {
    for (const a of brief.areas) {
      for (const it of a.qsBoqDraftItems) {
        currentBoqItems.push({ description: it.description });
        currentBudget += Number(it.sellingTotal);
      }
    }
  }

  const upsell = await generateUpsellRecommendations({
    propertyType: project.propertyType as any,
    designStyle: brief?.designStyle ?? null,
    currentBoqItems,
    currentBudget,
    clientNeeds: brief?.clientNeeds ?? (project.notes ?? ""),
  });

  const now = new Date();
  let createdCount = 0;
  for (const o of upsell.upsellOpportunities.slice(0, 8)) {
    await prisma.upsellRecommendation.create({
      data: {
        projectId: project.id,
        designBriefId: brief?.id ?? null,
        title: o.title,
        description: o.description,
        category: o.category,
        estimatedRevenueIncrease: new Prisma.Decimal(o.estimatedRevenueIncrease),
        estimatedCostIncrease: new Prisma.Decimal(o.estimatedCostIncrease),
        estimatedProfitIncrease: new Prisma.Decimal(o.estimatedProfitIncrease),
        priority: o.priority === "HIGH" ? UpsellPriority.HIGH : o.priority === "LOW" ? UpsellPriority.LOW : UpsellPriority.MEDIUM,
        status: UpsellStatus.SUGGESTED,
        pitchText: o.pitchText,
        createdAt: now,
        updatedAt: now,
      },
    });
    createdCount += 1;
  }

  return { ok: true as const, outcome: `Generated ${createdCount} upsell recommendation(s).` };
}

async function handleSendPaymentReminderDraft(params: { invoiceId: string; reason: string }) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { project: { include: { client: true } } },
  });
  if (!invoice) throw new Error("Invoice not found.");

  const recipient = pickMessageChannel({ phone: invoice.project.clientPhone ?? invoice.project.client?.phone ?? null, email: invoice.project.clientEmail ?? invoice.project.client?.email ?? null });
  if (!recipient) throw new Error("Missing client email/phone for payment reminder.");

  const subject = recipient.channel === "EMAIL" ? `Payment reminder: ${invoice.invoiceNumber}` : null;
  const body = [
    `Hi ${invoice.project.clientName || invoice.project.client?.name || "Client"},`,
    "",
    `This is a reminder that invoice ${invoice.invoiceNumber} has an outstanding balance.`,
    `Outstanding: SGD ${Number(invoice.outstandingAmount).toFixed(2)}`,
    invoice.dueDate ? `Due date: ${invoice.dueDate.toISOString().slice(0, 10)}` : null,
    "",
    "If you have already arranged payment, please ignore this message. If you need a copy of the invoice or payment details, we can resend immediately.",
    "",
    `[AI draft reason] ${params.reason}`,
  ]
    .filter(Boolean)
    .join("\n");

  await prisma.outboundMessage.create({
    data: {
      projectId: invoice.projectId,
      relatedType: "COLLECTION_REMINDER",
      relatedId: invoice.id,
      channel: recipient.channel,
      recipientName: invoice.project.clientName || invoice.project.client?.name || "Client",
      recipientAddress: recipient.address,
      subject,
      body,
      status: "DRAFT",
      sentAt: null,
      failedAt: null,
      providerMessageId: null,
      errorMessage: null,
    },
  });

  return { ok: true as const, outcome: `Created ${recipient.channel} payment reminder draft (not sent).` };
}

async function handleCloseCollectionCase(params: { invoiceId: string }) {
  const invoice = await prisma.invoice.findUnique({ where: { id: params.invoiceId }, select: { id: true, projectId: true, outstandingAmount: true } });
  if (!invoice) throw new Error("Invoice not found.");

  if (Number(invoice.outstandingAmount) > 0.01) {
    return { ok: true as const, outcome: "Invoice still has outstanding amount; collection case not closed." };
  }

  await syncCollectionCaseForInvoice({ projectId: invoice.projectId, invoiceId: invoice.id });
  return { ok: true as const, outcome: "Collection case synced/closed for fully paid invoice." };
}

async function executeAIAction(params: {
  action: AIActionName;
  entityType: AIEntityType;
  entityId: string;
  reason: string;
  metadata?: Record<string, unknown> | null;
}) {
  switch (params.action) {
    case "SEND_FIRST_CONTACT_MESSAGE":
    case "SEND_FOLLOW_UP_MESSAGE":
      if (params.entityType !== "LEAD") throw new Error("Entity type mismatch for lead action.");
      return await handleSendLeadMessageDraft({ action: params.action, leadId: params.entityId });

    case "REQUEST_PROGRESS_UPDATE":
      if (params.entityType !== "PROJECT") throw new Error("Entity type mismatch for project action.");
      return await handleRequestProgressUpdate({ projectId: params.entityId, reason: params.reason });

    case "GENERATE_LAYOUT_PLAN": {
      const areaId = String(params.metadata?.areaId ?? "");
      if (!areaId) throw new Error("Missing metadata.areaId for GENERATE_LAYOUT_PLAN.");
      return await handleGenerateLayoutPlan({
        areaId,
        title: typeof params.metadata?.title === "string" ? params.metadata.title : null,
        roomWidth: typeof params.metadata?.roomWidth === "number" ? params.metadata.roomWidth : null,
        roomLength: typeof params.metadata?.roomLength === "number" ? params.metadata.roomLength : null,
      });
    }

    case "GENERATE_3D_VISUAL": {
      const areaId = String(params.metadata?.areaId ?? "");
      if (!areaId) throw new Error("Missing metadata.areaId for GENERATE_3D_VISUAL.");
      return await handleGenerateVisualRender({
        areaId,
        promptOverride: typeof params.metadata?.promptOverride === "string" ? params.metadata.promptOverride : null,
      });
    }

    case "GENERATE_DESIGN_VARIATIONS": {
      const areaId = String(params.metadata?.areaId ?? "");
      if (!areaId) throw new Error("Missing metadata.areaId for GENERATE_DESIGN_VARIATIONS.");
      return await handleGenerateDesignVariations({ areaId });
    }

    case "GENERATE_UPSELL_RECOMMENDATION": {
      const projectId = typeof params.metadata?.projectId === "string" ? params.metadata.projectId : undefined;
      const designBriefId = typeof params.metadata?.designBriefId === "string" ? params.metadata.designBriefId : undefined;
      return await handleGenerateUpsellRecommendations({ projectId, designBriefId });
    }

    case "GENERATE_SALES_PACKAGE":
      if (params.entityType !== "DESIGN_BRIEF") throw new Error("Entity type mismatch for design brief action.");
      return await handleGenerateSalesPackage({ designBriefId: params.entityId });

    case "SEND_PAYMENT_REMINDER":
      if (params.entityType !== "INVOICE") throw new Error("Entity type mismatch for invoice action.");
      return await handleSendPaymentReminderDraft({ invoiceId: params.entityId, reason: params.reason });

    case "CLOSE_COLLECTION_CASE":
      if (params.entityType !== "INVOICE") throw new Error("Entity type mismatch for invoice action.");
      return await handleCloseCollectionCase({ invoiceId: params.entityId });

    default:
      // High-risk / not implemented actions: no-op (execution blocked by approval rules).
      return { ok: true as const, outcome: "No execution handler (action is approval-gated or not implemented)." };
  }
}

export async function runAIAction(input: RunAIActionInput & { actorUserId?: string | null; dryRun?: boolean }) {
  const setting = await getAIAutomationSetting();
  const mode = setting?.automationMode ?? parseAutomationModeFromEnv();
  const policy = buildActionPolicy({
    setting: setting ? { ...(setting as any), automationMode: mode } : { ...DEFAULT_AI_AUTOMATION_SETTING, automationMode: mode },
    action: input.action,
  });
  const approvalRequired = policy.requiresApproval;
  const autoExecute = policy.canAutoExecute;

  const initialStatus: AIActionStatus =
    !policy.allowed
      ? AIActionStatus.CANCELLED
      : approvalRequired
        ? AIActionStatus.APPROVAL_REQUIRED
        : mode === "MANUAL" || !autoExecute
          ? AIActionStatus.PENDING
          : AIActionStatus.EXECUTING;

  const log = await createAIActionLog({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    priority: input.priority,
    confidence: input.confidence,
    reason: input.reason,
    status: initialStatus,
    requiresApproval: approvalRequired,
    metadataJson: input.metadata ?? null,
  });

  if (!policy.allowed) {
    await updateAIActionLog(log.id, {
      errorMessage: policy.blockedReason ?? "Blocked by AI Control Center settings.",
    });
    return { logId: log.id, status: AIActionStatus.CANCELLED, executed: false as const };
  }

  // Manual mode or approval required: do not execute.
  if ((setting && !setting.isActive) || approvalRequired || mode === "MANUAL" || !autoExecute || Boolean(input.dryRun)) {
    return { logId: log.id, status: log.status, executed: false as const };
  }

  try {
    const res = await executeAIAction({
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      metadata: input.metadata ?? null,
    });

    await updateAIActionLog(log.id, {
      status: AIActionStatus.COMPLETED,
      executedAt: new Date(),
      errorMessage: null,
      metadataJson: (input.metadata ?? undefined) as any,
    });

    try {
      await ensurePendingOutcomeForCompletedAction({
        actionLogId: log.id,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        executedAt: new Date(),
      });
    } catch (e) {
      // Learning layer should never block core execution.
      console.warn("[ai-learning] failed to record outcome:", e);
    }

    if (input.actorUserId) {
      await auditLog({
        module: "ai_actions",
        action: "execute",
        actorUserId: input.actorUserId,
        projectId: null,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: { action: input.action, outcome: res.outcome, mode },
      });
    }

    return { logId: log.id, status: AIActionStatus.COMPLETED, executed: true as const, outcome: res.outcome };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await updateAIActionLog(log.id, {
      status: AIActionStatus.FAILED,
      failedAt: new Date(),
      errorMessage: msg,
    });
    return { logId: log.id, status: AIActionStatus.FAILED, executed: false as const, errorMessage: msg };
  }
}

export async function approveAIActionLog(params: { id: string; approvedBy: string; isExec: boolean }) {
  const log = await getAIActionLogById(params.id);
  if (!log) throw new Error("AI action log not found.");
  if (log.status === "CANCELLED" || log.status === "COMPLETED") throw new Error("Action is not approvable.");

  // For safety: only exec can approve actions that require approval.
  if (log.requiresApproval && !params.isExec) {
    throw new Error("Only ADMIN/DIRECTOR can approve this action.");
  }

  return await updateAIActionLog(params.id, {
    status: AIActionStatus.APPROVED,
    approvedBy: params.approvedBy,
    approvedAt: new Date(),
  });
}

export async function cancelAIActionLog(params: { id: string; cancelledBy: string }) {
  const log = await getAIActionLogById(params.id);
  if (!log) throw new Error("AI action log not found.");
  if (["COMPLETED", "CANCELLED"].includes(log.status)) return log;
  return await updateAIActionLog(params.id, {
    status: AIActionStatus.CANCELLED,
    errorMessage: `Cancelled by ${params.cancelledBy}`,
  });
}

export async function executeApprovedAIActionLog(params: { id: string; actorUserId?: string | null }) {
  const log = await getAIActionLogById(params.id);
  if (!log) throw new Error("AI action log not found.");
  if (log.status === "CANCELLED") throw new Error("Action is cancelled.");
  if (log.status === "COMPLETED") return { ok: true as const, outcome: "Already completed." };
  if (log.requiresApproval && log.status !== "APPROVED") {
    throw new Error("Approval required before execution.");
  }

  const setting = await getAIAutomationSetting();
  const mode = setting?.automationMode ?? parseAutomationModeFromEnv();
  const policy = buildActionPolicy({
    setting: setting ? { ...(setting as any), automationMode: mode } : { ...DEFAULT_AI_AUTOMATION_SETTING, automationMode: mode },
    action: log.action as AIActionName,
  });
  if (!policy.allowed) {
    await updateAIActionLog(log.id, { status: AIActionStatus.CANCELLED, errorMessage: policy.blockedReason ?? "Blocked by AI Control Center settings." });
    return { ok: false as const, errorMessage: "Blocked by AI Control Center settings." };
  }

  await updateAIActionLog(log.id, { status: AIActionStatus.EXECUTING });

  try {
    const res = await executeAIAction({
      action: log.action as AIActionName,
      entityType: log.entityType as AIEntityType,
      entityId: log.entityId,
      reason: log.reason,
      metadata: (log.metadataJson ?? null) as any,
    });

    await updateAIActionLog(log.id, {
      status: AIActionStatus.COMPLETED,
      executedAt: new Date(),
      errorMessage: null,
    });

    try {
      await ensurePendingOutcomeForCompletedAction({
        actionLogId: log.id,
        action: log.action as AIActionName,
        entityType: log.entityType as AIEntityType,
        entityId: log.entityId,
        executedAt: new Date(),
      });
    } catch (e) {
      console.warn("[ai-learning] failed to record outcome:", e);
    }

    if (params.actorUserId) {
      await auditLog({
        module: "ai_actions",
        action: "execute_approved",
        actorUserId: params.actorUserId,
        projectId: null,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: { action: log.action, outcome: res.outcome },
      });
    }

    return { ok: true as const, outcome: res.outcome };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await updateAIActionLog(log.id, {
      status: AIActionStatus.FAILED,
      failedAt: new Date(),
      errorMessage: msg,
    });
    return { ok: false as const, errorMessage: msg };
  }
}
