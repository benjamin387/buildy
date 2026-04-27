import "server-only";

import { prisma } from "@/lib/prisma";
import { CollectionChannel, type MessageChannel } from "@prisma/client";
import { syncCollectionCaseForInvoice } from "@/lib/collections/service";
import { createOutboundMessageDraft } from "@/lib/messaging/service";

function formatCurrencySgd(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(Math.round((value + Number.EPSILON) * 100) / 100);
}

function renderTemplate(template: string, context: Record<string, string>): string {
  return template.replaceAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const v = context[key];
    return v === undefined ? "" : v;
  });
}

function coerceMessageChannel(channel: CollectionChannel): MessageChannel | null {
  if (channel === "EMAIL") return "EMAIL";
  if (channel === "WHATSAPP") return "WHATSAPP";
  return null;
}

export async function scanOverdueInvoices(params?: { projectId?: string }) {
  const now = new Date();
  const whereProject = params?.projectId ? { projectId: params.projectId } : {};

  const invoices = await prisma.invoice.findMany({
    where: {
      ...whereProject,
      dueDate: { lt: now },
      outstandingAmount: { gt: 0 },
      status: { not: "VOID" },
    },
    select: { id: true, projectId: true, dueDate: true },
    take: 2000,
  });

  return { scanned: invoices.length, invoices };
}

export async function createOrUpdateCases(params?: { projectId?: string }) {
  const { invoices } = await scanOverdueInvoices(params);

  let upserted = 0;
  for (const inv of invoices) {
    await syncCollectionCaseForInvoice({ projectId: inv.projectId, invoiceId: inv.id });
    upserted += 1;
  }

  return { scanned: invoices.length, upserted };
}

export async function triggerReminders(params?: { projectId?: string; take?: number }) {
  const now = new Date();
  const whereProject = params?.projectId ? { projectId: params.projectId } : {};

  // Only send actions that are due (scheduledAt <= now) and pending, for supported channels.
  const actions = await prisma.collectionAction.findMany({
    where: {
      status: "PENDING",
      channel: { in: ["EMAIL", "WHATSAPP"] },
      scheduledAt: { lte: now },
      case: {
        ...whereProject,
        status: { notIn: ["PAID", "CLOSED"] },
        invoice: {
          dueDate: { lt: now },
          outstandingAmount: { gt: 0 },
          status: { not: "VOID" },
        },
      },
    },
    include: {
      case: {
        include: {
          project: { include: { client: true } },
          invoice: true,
        },
      },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: params?.take ?? 200,
  });

  let attempted = 0;
  let drafted = 0;
  let skipped = 0;

  const touchedInvoiceIds = new Set<string>();

  for (const action of actions) {
    const c = action.case;
    const inv = c.invoice;

    // Final guardrail: don't send if invoice is already settled.
    if (!inv.dueDate || Number(inv.outstandingAmount) <= 0.01 || inv.status === "PAID" || inv.status === "VOID") {
      await prisma.collectionAction.update({
        where: { id: action.id },
        data: { status: "CANCELLED", completedAt: now },
      });
      skipped += 1;
      continue;
    }

    const msgChannel = coerceMessageChannel(action.channel);
    if (!msgChannel) {
      await prisma.collectionAction.update({
        where: { id: action.id },
        data: { status: "CANCELLED", completedAt: now },
      });
      skipped += 1;
      continue;
    }

    const recipientAddress =
      msgChannel === "EMAIL" ? (c.debtorEmail ?? "").trim() : (c.debtorPhone ?? "").trim();
    if (!recipientAddress) {
      await prisma.collectionAction.update({
        where: { id: action.id },
        data: {
          status: "CANCELLED",
          completedAt: now,
          message: `${action.message ?? ""}\n\n[automation] Cancelled: missing recipient for ${msgChannel}.`.trim(),
        },
      });
      skipped += 1;
      continue;
    }

    const tplCode = action.templateCode?.trim() || null;
    const tpl = tplCode
      ? await prisma.collectionReminderTemplate.findUnique({ where: { code: tplCode } })
      : null;

    const context: Record<string, string> = {
      debtorName: c.debtorName,
      invoiceNumber: inv.invoiceNumber,
      projectName: c.project.name,
      outstandingAmount: formatCurrencySgd(Number(inv.outstandingAmount)),
      dueDate: new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(inv.dueDate),
      daysPastDue: String(c.daysPastDue),
    };

    const subject =
      msgChannel === "EMAIL"
        ? renderTemplate(tpl?.subject ?? `Payment reminder: {{invoiceNumber}}`, context)
        : null;
    const body = renderTemplate(tpl?.body ?? action.message ?? "", context).trim();
    if (!body) {
      await prisma.collectionAction.update({
        where: { id: action.id },
        data: {
          status: "CANCELLED",
          completedAt: now,
          message: `${action.message ?? ""}\n\n[automation] Cancelled: empty template/body.`.trim(),
        },
      });
      skipped += 1;
      continue;
    }

    attempted += 1;
    const draftResult = await createOutboundMessageDraft({
      projectId: c.projectId,
      relatedType: "COLLECTION_REMINDER",
      relatedId: c.id,
      channel: msgChannel,
      recipientName: c.debtorName,
      recipientAddress,
      subject,
      body,
      includeSecureLink: true,
      includePdfAttachment: false,
      linkExpiresInDays: 14,
      // Link to the invoice (client-facing) for payment convenience.
      documentType: "INVOICE",
      documentId: c.invoiceId,
    });

    touchedInvoiceIds.add(c.invoiceId);

    await prisma.collectionAction.update({
      where: { id: action.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        message: `${body}\n\n[automation] Drafted outbound message ${draftResult.messageId} (not sent).`.trim(),
      },
    });

    if (!["PAID", "CLOSED", "PROMISE_TO_PAY", "DISPUTED"].includes(c.status)) {
      const nextStatus =
        action.stageDays !== null && action.stageDays >= 30
          ? "ESCALATED"
          : action.actionType === "LETTER_OF_DEMAND"
            ? "ESCALATED"
            : "REMINDER_SENT";

      await prisma.collectionCase.update({
        where: { id: c.id },
        data: { status: nextStatus },
      });
    }

    drafted += 1;
  }

  // Re-sync cases after sending so nextActionDate is accurate and paid invoices auto-close.
  for (const invoiceId of touchedInvoiceIds) {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, projectId: true } });
    if (!inv) continue;
    await syncCollectionCaseForInvoice({ projectId: inv.projectId, invoiceId: inv.id });
  }

  return { dueActions: actions.length, attempted, drafted, skipped };
}

export async function runCollectionsAutomation(params?: { projectId?: string }) {
  const cases = await createOrUpdateCases({ projectId: params?.projectId });
  const reminders = await triggerReminders({ projectId: params?.projectId });
  return { cases, reminders };
}
