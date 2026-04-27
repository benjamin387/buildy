"use server";

import { z } from "zod";
import {
  AccountingProvider,
  AccountingSyncEntityType,
  AccountingSyncStatus,
  AccountingMappingType,
  Permission,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { auditLog } from "@/lib/audit";
import {
  syncContactsToXero,
  syncInvoiceToXero,
  syncItemsToXero,
  syncPaymentReceiptToXero,
  syncSupplierBillToXero,
} from "@/lib/accounting/sync-service";

const provider = AccountingProvider.XERO;

export async function initializeAccountingDefaultsAction() {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.accountingConnection.upsert({
      where: { provider },
      create: {
        provider,
        status: "DISCONNECTED",
        connectedAt: null,
        refreshedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      update: { updatedAt: now },
    });

    // Internal foundation codes for GST readiness (provider-specific mappings come later).
    await tx.taxCode.upsert({
      where: { provider_code: { provider, code: "GST9" } },
      create: { provider, code: "GST9", name: "GST Standard Rated (9%)", rate: 0.09, isActive: true },
      update: { name: "GST Standard Rated (9%)", rate: 0.09, isActive: true },
    });
    await tx.taxCode.upsert({
      where: { provider_code: { provider, code: "EXEMPT" } },
      create: { provider, code: "EXEMPT", name: "GST Exempt (0%)", rate: 0, isActive: true },
      update: { name: "GST Exempt (0%)", rate: 0, isActive: true },
    });

    await tx.accountMapping.upsert({
      where: { provider_mappingType_internalKey: { provider, mappingType: "TAX_CODE", internalKey: "GST9" } },
      create: { provider, mappingType: "TAX_CODE", internalKey: "GST9", externalCode: "GST9", description: "Standard rated GST" },
      update: { externalCode: "GST9", description: "Standard rated GST", isActive: true },
    });
    await tx.accountMapping.upsert({
      where: { provider_mappingType_internalKey: { provider, mappingType: "TAX_CODE", internalKey: "EXEMPT" } },
      create: { provider, mappingType: "TAX_CODE", internalKey: "EXEMPT", externalCode: "EXEMPT", description: "Tax exempt/0%" },
      update: { externalCode: "EXEMPT", description: "Tax exempt/0%", isActive: true },
    });
  });

  await auditLog({
    module: "accounting",
    action: "initialize_defaults",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingConnection",
    entityId: provider,
    metadata: { provider },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

const mappingSchema = z.object({
  mappingType: z.nativeEnum(AccountingMappingType),
  internalKey: z.string().min(1).max(80),
  externalCode: z.string().min(1).max(80),
  description: z.string().max(240).optional().or(z.literal("")).default(""),
});

export async function upsertAccountMappingAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const parsed = mappingSchema.safeParse({
    mappingType: formData.get("mappingType"),
    internalKey: formData.get("internalKey"),
    externalCode: formData.get("externalCode"),
    description: formData.get("description"),
  });
  if (!parsed.success) throw new Error("Invalid mapping.");

  await prisma.accountMapping.upsert({
    where: {
      provider_mappingType_internalKey: {
        provider,
        mappingType: parsed.data.mappingType,
        internalKey: parsed.data.internalKey,
      },
    },
    create: {
      provider,
      mappingType: parsed.data.mappingType,
      internalKey: parsed.data.internalKey,
      externalCode: parsed.data.externalCode,
      description: parsed.data.description || null,
      isActive: true,
    },
    update: {
      externalCode: parsed.data.externalCode,
      description: parsed.data.description || null,
      isActive: true,
    },
  });

  await auditLog({
    module: "accounting",
    action: "upsert_mapping",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountMapping",
    entityId: `${parsed.data.mappingType}:${parsed.data.internalKey}`,
    metadata: { provider, ...parsed.data },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

export async function syncContactsAction() {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const result = await syncContactsToXero({ take: 50 });

  await auditLog({
    module: "accounting",
    action: "sync_contacts",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingSyncLog",
    entityId: AccountingSyncEntityType.CLIENT,
    metadata: { provider, ...result },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

export async function syncItemsAction() {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const result = await syncItemsToXero({ take: 100 });

  await auditLog({
    module: "accounting",
    action: "sync_items",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingSyncLog",
    entityId: AccountingSyncEntityType.ITEM_MASTER,
    metadata: { provider, ...result },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

export async function syncRecentInvoicesAction() {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const invoices = await prisma.invoice.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
    take: 25,
  });

  for (const inv of invoices) {
    await syncInvoiceToXero(inv.id);
  }

  await auditLog({
    module: "accounting",
    action: "sync_recent_invoices",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingSyncLog",
    entityId: AccountingSyncEntityType.INVOICE,
    metadata: { provider, count: invoices.length },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

export async function syncRecentSupplierBillsAction() {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const bills = await prisma.supplierBill.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
    take: 25,
  });

  for (const bill of bills) {
    await syncSupplierBillToXero(bill.id);
  }

  await auditLog({
    module: "accounting",
    action: "sync_recent_supplier_bills",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingSyncLog",
    entityId: AccountingSyncEntityType.SUPPLIER_BILL,
    metadata: { provider, count: bills.length },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

export async function syncRecentReceiptsAction() {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const receipts = await prisma.paymentReceipt.findMany({
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    select: { id: true },
    take: 25,
  });

  for (const r of receipts) {
    await syncPaymentReceiptToXero(r.id);
  }

  await auditLog({
    module: "accounting",
    action: "sync_recent_receipts",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingSyncLog",
    entityId: AccountingSyncEntityType.PAYMENT_RECEIPT,
    metadata: { provider, count: receipts.length },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

export async function clearSyncLogsAction() {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  await prisma.accountingSyncLog.deleteMany({ where: { provider } });

  await auditLog({
    module: "accounting",
    action: "clear_sync_logs",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingSyncLog",
    entityId: provider,
    metadata: { provider },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

export async function markConnectionConnectedStubAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const orgName = String(formData.get("organisationName") ?? "").trim();
  const tenantId = String(formData.get("tenantId") ?? "").trim();

  await prisma.accountingConnection.upsert({
    where: { provider },
    create: {
      provider,
      organisationName: orgName || null,
      tenantId: tenantId || null,
      status: "CONNECTED",
      connectedAt: new Date(),
      refreshedAt: new Date(),
    },
    update: {
      organisationName: orgName || null,
      tenantId: tenantId || null,
      status: "CONNECTED",
      connectedAt: new Date(),
      refreshedAt: new Date(),
    },
  });

  await auditLog({
    module: "accounting",
    action: "connection_stub_connected",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingConnection",
    entityId: provider,
    metadata: { provider, organisationName: orgName || null, tenantId: tenantId || null },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

export async function markConnectionDisconnectedAction() {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  await prisma.accountingConnection.upsert({
    where: { provider },
    create: {
      provider,
      status: "DISCONNECTED",
      connectedAt: null,
      refreshedAt: null,
    },
    update: {
      status: "DISCONNECTED",
      connectedAt: null,
      refreshedAt: null,
    },
  });

  await auditLog({
    module: "accounting",
    action: "connection_disconnected",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingConnection",
    entityId: provider,
    metadata: { provider },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}

export async function writeSyncLogSkippedAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const entityType = String(formData.get("entityType") ?? "") as AccountingSyncEntityType;
  const internalId = String(formData.get("internalId") ?? "");
  const message = String(formData.get("message") ?? "");

  if (!Object.values(AccountingSyncEntityType).includes(entityType)) throw new Error("Invalid entity type.");
  if (!internalId) throw new Error("Invalid internalId.");

  await prisma.accountingSyncLog.create({
    data: {
      provider,
      entityType,
      internalId,
      externalId: null,
      direction: "PUSH",
      status: AccountingSyncStatus.SKIPPED,
      message,
      syncedAt: new Date(),
    },
  });

  await auditLog({
    module: "accounting",
    action: "sync_log_manual",
    actorUserId: userId,
    projectId: null,
    entityType: "AccountingSyncLog",
    entityId: `${entityType}:${internalId}`,
    metadata: { provider, entityType, internalId, status: "SKIPPED" },
  });

  revalidatePath("/settings/accounting");
  redirect("/settings/accounting");
}
