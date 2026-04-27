import { prisma } from "@/lib/prisma";
import {
  CollectionActionStatus,
  CollectionActionType,
  CollectionCaseStatus,
  CollectionChannel,
  CollectionSeverity,
  NotificationSeverity,
  Prisma,
} from "@prisma/client";
import {
  computeCollectionSeverity,
  computeDaysPastDue,
} from "@/lib/collections/engine";
import { generateCollectionCaseNumber } from "@/lib/collections/case-number";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundCurrency(value));
}

function formatCurrencySgd(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(roundCurrency(value));
}

function formatDateShort(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function renderTemplate(template: string, context: Record<string, string>): string {
  return template.replaceAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const v = context[key];
    return v === undefined ? "" : v;
  });
}

export async function ensureDefaultCollectionReminderTemplates() {
  // Templates used by the automated receivables control engine.
  await prisma.collectionReminderTemplate.createMany({
    data: [
      {
        code: "COLL_EMAIL_7_FRIENDLY",
        name: "Friendly Reminder (Email) - 7 DPD",
        daysPastDue: 7,
        channel: "EMAIL",
        subject: "Friendly reminder: Invoice {{invoiceNumber}}",
        body:
          "Dear {{debtorName}},\n\nFriendly reminder that invoice {{invoiceNumber}} for {{projectName}} is overdue.\nDue date: {{dueDate}} · Outstanding: {{outstandingAmount}}.\n\nPlease arrange payment today or let us know your payment date.\n\nRegards,\nAccounts",
      },
      {
        code: "COLL_WA_7_FRIENDLY",
        name: "Friendly Reminder (WhatsApp) - 7 DPD",
        daysPastDue: 7,
        channel: "WHATSAPP",
        subject: null,
        body:
          "Hi {{debtorName}}, friendly reminder invoice {{invoiceNumber}} for {{projectName}} is overdue.\nDue: {{dueDate}} · Outstanding: {{outstandingAmount}}.\nPlease arrange payment today or let us know your payment date.",
      },
      {
        code: "COLL_EMAIL_14_FIRM",
        name: "Firm Reminder (Email) - 14 DPD",
        daysPastDue: 14,
        channel: "EMAIL",
        subject: "Payment overdue: Invoice {{invoiceNumber}}",
        body:
          "Dear {{debtorName}},\n\nThis is a reminder that invoice {{invoiceNumber}} for {{projectName}} is overdue.\nOutstanding amount: {{outstandingAmount}}.\n\nPlease arrange payment within 3 days or advise your expected payment date.\n\nRegards,\nAccounts",
      },
      {
        code: "COLL_WA_14_FIRM",
        name: "Firm Reminder (WhatsApp) - 14 DPD",
        daysPastDue: 14,
        channel: "WHATSAPP",
        subject: null,
        body:
          "Hi {{debtorName}}, invoice {{invoiceNumber}} remains unpaid.\nOutstanding: {{outstandingAmount}}.\nPlease advise your payment date.",
      },
      {
        code: "COLL_EMAIL_21_FINAL",
        name: "Final Notice (Email) - 21 DPD",
        daysPastDue: 21,
        channel: "EMAIL",
        subject: "Final notice: Invoice {{invoiceNumber}} remains unpaid",
        body:
          "Dear {{debtorName}},\n\nDespite previous reminders, invoice {{invoiceNumber}} for {{projectName}} remains unpaid.\nDue date: {{dueDate}} · Outstanding: {{outstandingAmount}}.\n\nPlease settle within 48 hours or provide your confirmed payment date, failing which we may suspend further work and proceed with recovery actions.\n\nRegards,\nAccounts",
      },
      {
        code: "COLL_WA_21_FINAL",
        name: "Final Notice (WhatsApp) - 21 DPD",
        daysPastDue: 21,
        channel: "WHATSAPP",
        subject: null,
        body:
          "Hi {{debtorName}}, final notice: invoice {{invoiceNumber}} remains unpaid.\nOutstanding: {{outstandingAmount}}.\nPlease settle within 48 hours or provide payment date.",
      },
      {
        code: "COLL_EMAIL_30_ESCALATION",
        name: "Escalation Notice (Email) - 30 DPD",
        daysPastDue: 30,
        channel: "EMAIL",
        subject: "Escalation notice: Invoice {{invoiceNumber}} overdue",
        body:
          "Dear {{debtorName}},\n\nInvoice {{invoiceNumber}} for {{projectName}} remains overdue beyond 30 days.\nOutstanding: {{outstandingAmount}}.\n\nPlease settle immediately or contact us to discuss, failing which we may proceed with escalation.\n\nRegards,\nAccounts",
      },
      {
        code: "COLL_WA_30_ESCALATION",
        name: "Escalation Notice (WhatsApp) - 30 DPD",
        daysPastDue: 30,
        channel: "WHATSAPP",
        subject: null,
        body:
          "Hi {{debtorName}}, invoice {{invoiceNumber}} is overdue beyond 30 days.\nOutstanding: {{outstandingAmount}}.\nPlease settle immediately or contact us to discuss.",
      },
      {
        code: "COLL_MANUAL_30_LEGAL",
        name: "30 DPD Legal Escalation Review (Manual)",
        daysPastDue: 30,
        channel: "MANUAL",
        subject: null,
        body:
          "Legal escalation review: prepare case summary for management review (invoice, debtor contact, prior reminders, correspondence).",
      },
    ],
    skipDuplicates: true,
  });
}

export async function computeCollectionsSummary(params: { projectId?: string }) {
  const now = new Date();
  const where = params.projectId ? { projectId: params.projectId } : {};

  const cases = await prisma.collectionCase.findMany({
    where,
    select: {
      status: true,
      severity: true,
      nextActionDate: true,
      outstandingAmount: true,
    },
  });

  const open = cases.filter((c) => !["PAID", "CLOSED"].includes(c.status));
  const overdueAmount = roundCurrency(open.reduce((sum, c) => sum + Number(c.outstandingAmount), 0));
  const openCases = open.length;
  const criticalCases = open.filter((c) => c.severity === "CRITICAL").length;
  const dueToday = open.filter((c) => {
    if (!c.nextActionDate) return false;
    const d = c.nextActionDate;
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;

  const severityCounts = open.reduce(
    (acc, c) => {
      acc[c.severity] = (acc[c.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const pendingActionsDueToday = await prisma.collectionAction.count({
    where: {
      status: "PENDING",
      scheduledAt: { gte: start, lte: end },
      channel: { in: ["EMAIL", "WHATSAPP"] },
      case: {
        ...where,
        status: { notIn: ["PAID", "CLOSED"] },
      },
    },
  });

  return {
    overdueAmount,
    openCases,
    criticalCases,
    casesDueToday: dueToday,
    severityCounts,
    pendingActionsDueToday,
  };
}

export async function listCollectionCases(params: { projectId?: string }) {
  const where = params.projectId ? { projectId: params.projectId } : {};

  return prisma.collectionCase.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, projectCode: true } },
      invoice: { select: { id: true, invoiceNumber: true, issueDate: true, dueDate: true, status: true } },
    },
    orderBy: [
      { severity: "desc" },
      { daysPastDue: "desc" },
      { nextActionDate: "asc" },
      { updatedAt: "desc" },
    ],
    take: 500,
  });
}

export async function getCollectionCaseById(caseId: string) {
  return prisma.collectionCase.findUnique({
    where: { id: caseId },
    include: {
      project: { select: { id: true, name: true, projectCode: true } },
      invoice: { select: { id: true, invoiceNumber: true, status: true, outstandingAmount: true, dueDate: true, totalAmount: true } },
      actions: { orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }] },
    },
  });
}

export async function listCollectionActionsDueToday(params: { projectId?: string; take?: number }) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const whereProject = params.projectId ? { projectId: params.projectId } : {};

  return prisma.collectionAction.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { gte: start, lte: end },
      channel: { in: ["EMAIL", "WHATSAPP", "MANUAL"] },
      case: {
        ...whereProject,
        status: { notIn: ["PAID", "CLOSED"] },
      },
    },
    include: {
      case: {
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          invoice: { select: { id: true, invoiceNumber: true, dueDate: true, outstandingAmount: true } },
        },
      },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: params.take ?? 50,
  });
}

export async function syncCollectionCaseForInvoice(params: { projectId: string; invoiceId: string }) {
  const now = new Date();
  await ensureDefaultCollectionReminderTemplates();

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { project: { include: { client: true } } },
  });
  if (!invoice || invoice.projectId !== params.projectId) return null;

  const dueDate = invoice.dueDate;
  const outstanding = roundCurrency(Number(invoice.outstandingAmount));

  const existing = await prisma.collectionCase.findUnique({
    where: { invoiceId: invoice.id },
    include: { actions: true },
  });

  // Close/mark paid when invoice is settled or no due date.
  if (!dueDate || outstanding <= 0.01 || invoice.status === "PAID" || invoice.status === "VOID") {
    if (!existing) return null;

    const nextStatus: CollectionCaseStatus =
      invoice.status === "VOID" ? "CLOSED" : outstanding <= 0.01 || invoice.status === "PAID" ? "PAID" : existing.status;

    const updated = await prisma.collectionCase.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        outstandingAmount: toDecimal(Math.max(outstanding, 0)),
        daysPastDue: 0,
        nextActionDate: null,
      },
    });

    // Cancel any pending actions so automation doesn't send after settlement.
    await prisma.collectionAction.updateMany({
      where: { caseId: existing.id, status: "PENDING" },
      data: { status: "CANCELLED", completedAt: now },
    });

    return updated;
  }

  const daysPastDue = computeDaysPastDue(dueDate, now);
  if (daysPastDue <= 0) {
    // Not overdue yet; keep but de-risk.
    if (!existing) return null;
    const updated = await prisma.collectionCase.update({
      where: { id: existing.id },
      data: {
        outstandingAmount: toDecimal(outstanding),
        dueDate,
        daysPastDue: 0,
        severity: "LOW",
        nextActionDate: null,
      },
    });

    await prisma.collectionAction.updateMany({
      where: { caseId: existing.id, status: "PENDING" },
      data: { status: "CANCELLED", completedAt: now },
    });

    return updated;
  }

  const severity: CollectionSeverity = computeCollectionSeverity(daysPastDue);

  const debtorName =
    invoice.project.clientName ||
    invoice.project.client?.name ||
    invoice.project.client?.companyName ||
    "Client";
  const debtorEmail = invoice.project.clientEmail || invoice.project.client?.email || null;
  const debtorPhone = invoice.project.clientPhone || invoice.project.client?.phone || null;

  const caseRecord = existing
    ? await prisma.collectionCase.update({
        where: { id: existing.id },
        data: {
          outstandingAmount: toDecimal(outstanding),
          dueDate,
          daysPastDue,
          severity,
          debtorName,
          debtorEmail,
          debtorPhone,
          // Keep current status unless it was closed/paid incorrectly.
          status: ["PAID", "CLOSED"].includes(existing.status) ? "OPEN" : existing.status,
          nextActionDate: existing.nextActionDate,
        },
      })
    : await prisma.collectionCase.create({
        data: {
          projectId: params.projectId,
          invoiceId: invoice.id,
          caseNumber: generateCollectionCaseNumber(now),
          debtorName,
          debtorEmail,
          debtorPhone,
          outstandingAmount: toDecimal(outstanding),
          dueDate,
          daysPastDue,
          severity,
          status: "OPEN",
          nextActionDate: null,
        },
      });

  // In-app notifications for finance visibility (best-effort).
  try {
    if (!existing) {
      await dispatchNotification({
        roleKeys: ["FINANCE", "ADMIN", "DIRECTOR"],
        entityType: "CollectionCase",
        entityId: caseRecord.id,
        title: "Collection case created",
        message: `Invoice ${invoice.invoiceNumber} is overdue (${daysPastDue} DPD). Outstanding: ${formatCurrencySgd(outstanding)}.`,
        severity: daysPastDue > 30 ? NotificationSeverity.CRITICAL : NotificationSeverity.WARNING,
        actionUrl: `/collections/${caseRecord.id}`,
        metadata: { invoiceId: invoice.id, projectId: invoice.projectId, daysPastDue, outstanding },
        dedupeKey: `CollectionCaseCreated:${invoice.id}`,
      });
    } else if (severity === "CRITICAL" && existing.severity !== "CRITICAL") {
      await dispatchNotification({
        roleKeys: ["FINANCE", "ADMIN", "DIRECTOR"],
        entityType: "CollectionCase",
        entityId: caseRecord.id,
        title: "Collection escalation: critical overdue",
        message: `Invoice ${invoice.invoiceNumber} is now >30 days overdue (${daysPastDue} DPD). Outstanding: ${formatCurrencySgd(outstanding)}.`,
        severity: NotificationSeverity.CRITICAL,
        actionUrl: `/collections/${caseRecord.id}`,
        metadata: { invoiceId: invoice.id, projectId: invoice.projectId, daysPastDue, outstanding },
        dedupeKey: `CollectionEscalationCritical:${invoice.id}`,
      });
    }
  } catch {
    // ignore
  }

  // Automated stages (only created once per stage + channel).
  const stagePlan: Array<{
    stageDays: number;
    actions: Array<{
      channel: CollectionChannel;
      actionType: CollectionActionType;
      templateCode: string;
    }>;
  }> = [
    {
      stageDays: 7,
      actions: [
        { channel: "WHATSAPP", actionType: "WHATSAPP_REMINDER", templateCode: "COLL_WA_7_FRIENDLY" },
        { channel: "EMAIL", actionType: "EMAIL_REMINDER", templateCode: "COLL_EMAIL_7_FRIENDLY" },
      ],
    },
    {
      stageDays: 14,
      actions: [
        { channel: "WHATSAPP", actionType: "WHATSAPP_REMINDER", templateCode: "COLL_WA_14_FIRM" },
        { channel: "EMAIL", actionType: "EMAIL_REMINDER", templateCode: "COLL_EMAIL_14_FIRM" },
      ],
    },
    {
      stageDays: 21,
      actions: [
        { channel: "WHATSAPP", actionType: "WHATSAPP_REMINDER", templateCode: "COLL_WA_21_FINAL" },
        { channel: "EMAIL", actionType: "LETTER_OF_DEMAND", templateCode: "COLL_EMAIL_21_FINAL" },
      ],
    },
    {
      stageDays: 30,
      actions: [
        { channel: "WHATSAPP", actionType: "WHATSAPP_REMINDER", templateCode: "COLL_WA_30_ESCALATION" },
        { channel: "EMAIL", actionType: "EMAIL_REMINDER", templateCode: "COLL_EMAIL_30_ESCALATION" },
        { channel: "MANUAL", actionType: "LEGAL_ESCALATION", templateCode: "COLL_MANUAL_30_LEGAL" },
      ],
    },
  ];

  const neededTemplateCodes = Array.from(
    new Set(stagePlan.flatMap((s) => s.actions.map((a) => a.templateCode))),
  );
  const templates = await prisma.collectionReminderTemplate.findMany({
    where: { code: { in: neededTemplateCodes } },
  });
  const templateByCode = new Map(templates.map((t) => [t.code, t]));

  const existingActions = await prisma.collectionAction.findMany({
    where: { caseId: caseRecord.id },
  });
  const existingByStageChannel = new Map<string, (typeof existingActions)[number]>();
  for (const a of existingActions) {
    if (a.stageDays === null) continue;
    existingByStageChannel.set(`${a.stageDays}:${a.channel}`, a);
  }

  // Backward-compat cleanup: older versions queued pending actions without stage metadata.
  // Cancel those so the new stage-based engine is the single source of truth for reminders.
  await prisma.collectionAction.updateMany({
    where: {
      caseId: caseRecord.id,
      stageDays: null,
      status: "PENDING",
      actionType: { in: ["EMAIL_REMINDER", "WHATSAPP_REMINDER", "LETTER_OF_DEMAND", "LEGAL_ESCALATION"] },
    },
    data: { status: "CANCELLED", completedAt: now },
  });

  const contextBase: Record<string, string> = {
    debtorName,
    invoiceNumber: invoice.invoiceNumber,
    projectName: invoice.project.name,
    outstandingAmount: formatCurrencySgd(outstanding),
    dueDate: formatDateShort(dueDate),
    daysPastDue: String(daysPastDue),
  };

  for (const stage of stagePlan) {
    if (daysPastDue < stage.stageDays) continue;
    const scheduledAt = new Date(dueDate.getTime() + stage.stageDays * MS_PER_DAY);

    for (const actionSpec of stage.actions) {
      const tpl = templateByCode.get(actionSpec.templateCode);
      const bodyTemplate = tpl?.body ?? "";
      const rendered = bodyTemplate ? renderTemplate(bodyTemplate, contextBase) : null;
      const existingAction = existingByStageChannel.get(`${stage.stageDays}:${actionSpec.channel}`) ?? null;

      if (existingAction && existingAction.status === "COMPLETED") continue;

      if (!existingAction) {
        await prisma.collectionAction.create({
          data: {
            caseId: caseRecord.id,
            stageDays: stage.stageDays,
            templateCode: actionSpec.templateCode,
            actionType: actionSpec.actionType,
            channel: actionSpec.channel,
            status: "PENDING",
            scheduledAt,
            message: rendered,
          },
        });
      } else {
        // Keep PENDING/CANCELLED/FAILED actions in sync with schedule & latest outstanding preview.
        await prisma.collectionAction.update({
          where: { id: existingAction.id },
          data: {
            templateCode: actionSpec.templateCode,
            actionType: actionSpec.actionType,
            scheduledAt,
            message: rendered,
            status: existingAction.status === "CANCELLED" ? "PENDING" : existingAction.status,
          },
        });
      }
    }
  }

  // Update nextActionDate to the earliest pending action (if already due, show today for operator control).
  const nextPending = await prisma.collectionAction.findFirst({
    where: { caseId: caseRecord.id, status: "PENDING" },
    orderBy: [{ scheduledAt: "asc" }],
    select: { scheduledAt: true },
  });
  const nextActionDate = nextPending
    ? nextPending.scheduledAt.getTime() < now.getTime()
      ? now
      : nextPending.scheduledAt
    : null;

  // Day 30+ always flags escalation for control visibility.
  const nextStatus =
    caseRecord.status === "PROMISE_TO_PAY" || caseRecord.status === "DISPUTED" || caseRecord.status === "CLOSED" || caseRecord.status === "PAID"
      ? caseRecord.status
      : daysPastDue >= 30
        ? "ESCALATED"
        : caseRecord.status;

  await prisma.collectionCase.update({
    where: { id: caseRecord.id },
    data: { nextActionDate, status: nextStatus },
  });

  return caseRecord;
}

export async function refreshOverdueCollectionCases(params: { projectId?: string }) {
  const now = new Date();
  const where = params.projectId
    ? { projectId: params.projectId }
    : {};

  const invoices = await prisma.invoice.findMany({
    where: {
      ...where,
      dueDate: { lt: now },
      outstandingAmount: { gt: 0 },
      status: { not: "VOID" },
    },
    select: { id: true, projectId: true },
    take: 1000,
  });

  let upserted = 0;
  for (const inv of invoices) {
    await syncCollectionCaseForInvoice({ projectId: inv.projectId, invoiceId: inv.id });
    upserted += 1;
  }

  return { scanned: invoices.length, upserted };
}

export async function addCollectionAction(params: {
  caseId: string;
  actionType: CollectionActionType;
  channel: CollectionChannel;
  message?: string | null;
  scheduledAt?: Date;
  status?: CollectionActionStatus;
}) {
  const scheduledAt = params.scheduledAt ?? new Date();
  const status = params.status ?? "COMPLETED";
  const completedAt = status === "COMPLETED" ? new Date() : null;

  return prisma.collectionAction.create({
    data: {
      caseId: params.caseId,
      actionType: params.actionType,
      channel: params.channel,
      status,
      scheduledAt,
      completedAt,
      message: params.message ?? null,
    },
  });
}

export async function completeCollectionAction(params: { caseId: string; actionId: string }) {
  const now = new Date();
  const action = await prisma.collectionAction.findUnique({
    where: { id: params.actionId },
    include: { case: { select: { id: true, projectId: true, invoiceId: true, status: true } } },
  });
  if (!action) throw new Error("Action not found.");
  if (action.caseId !== params.caseId) throw new Error("Action does not belong to case.");

  await prisma.collectionAction.update({
    where: { id: action.id },
    data: { status: "COMPLETED", completedAt: now },
  });

  if (!["PAID", "CLOSED"].includes(action.case.status)) {
    const nextCaseStatus: CollectionCaseStatus =
      action.actionType === "LETTER_OF_DEMAND" || action.actionType === "LEGAL_ESCALATION"
        ? "ESCALATED"
        : action.actionType === "EMAIL_REMINDER" || action.actionType === "WHATSAPP_REMINDER"
          ? "REMINDER_SENT"
          : action.case.status;

    if (nextCaseStatus !== action.case.status) {
      await prisma.collectionCase.update({
        where: { id: action.case.id },
        data: { status: nextCaseStatus },
      });
    }
  }

  // Re-sync to refresh nextActionDate and (if needed) queue the next pending action stage.
  await syncCollectionCaseForInvoice({ projectId: action.case.projectId, invoiceId: action.case.invoiceId });

  return { ok: true };
}

export async function markPromiseToPay(params: {
  caseId: string;
  nextActionDate?: Date | null;
  notes?: string | null;
}) {
  return prisma.collectionCase.update({
    where: { id: params.caseId },
    data: {
      status: "PROMISE_TO_PAY",
      nextActionDate: params.nextActionDate ?? null,
      notes: params.notes ?? undefined,
    },
  });
}

export async function closeCollectionCase(params: { caseId: string; notes?: string | null }) {
  return prisma.collectionCase.update({
    where: { id: params.caseId },
    data: {
      status: "CLOSED",
      nextActionDate: null,
      notes: params.notes ?? undefined,
    },
  });
}
