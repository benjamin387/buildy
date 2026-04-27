import "server-only";

import {
  AccountingProvider,
  AccountingSyncDirection,
  AccountingSyncEntityType,
  AccountingSyncStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getXeroClientIfConfigured } from "@/lib/accounting/xero-client";
import {
  mapClientToXeroPayload,
  mapInvoiceToXeroPayload,
  mapItemMasterToXeroPayload,
  mapReceiptToXeroPayload,
  mapSupplierBillToXeroPayload,
  mapVendorToXeroPayload,
} from "@/lib/accounting/mappers";

export type SyncResult = {
  provider: AccountingProvider;
  entityType: AccountingSyncEntityType;
  internalId: string;
  status: AccountingSyncStatus;
  message: string;
};

async function connectionStatus(provider: AccountingProvider) {
  const row = await prisma.accountingConnection.findFirst({
    where: { provider },
    select: { status: true, tenantId: true, organisationName: true, connectedAt: true, refreshedAt: true },
  });
  return row ?? null;
}

async function writeLog(input: {
  provider: AccountingProvider;
  entityType: AccountingSyncEntityType;
  internalId: string;
  externalId?: string | null;
  direction: AccountingSyncDirection;
  status: AccountingSyncStatus;
  message: string;
  syncedAt?: Date;
}) {
  await prisma.accountingSyncLog.create({
    data: {
      provider: input.provider,
      entityType: input.entityType,
      internalId: input.internalId,
      externalId: input.externalId ?? null,
      direction: input.direction,
      status: input.status,
      message: input.message,
      syncedAt: input.syncedAt ?? new Date(),
    },
  });
}

function gstTaxCodeHint(amount: Prisma.Decimal | number): string | null {
  const v = Number(amount);
  if (!Number.isFinite(v) || v <= 0) return "EXEMPT";
  return "GST9";
}

async function dryRunOrSkip(input: {
  provider: AccountingProvider;
  entityType: AccountingSyncEntityType;
  internalId: string;
  payload: unknown;
  connection: Awaited<ReturnType<typeof connectionStatus>>;
}): Promise<SyncResult> {
  const client = await getXeroClientIfConfigured();

  if (!client) {
    const message =
      "Skipped: Xero env not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI, XERO_TENANT_ID, XERO_ACCESS_TOKEN.";
    await writeLog({
      provider: input.provider,
      entityType: input.entityType,
      internalId: input.internalId,
      direction: AccountingSyncDirection.PUSH,
      status: AccountingSyncStatus.SKIPPED,
      message,
    });
    return {
      provider: input.provider,
      entityType: input.entityType,
      internalId: input.internalId,
      status: AccountingSyncStatus.SKIPPED,
      message,
    };
  }

  if (input.connection?.status !== "CONNECTED") {
    const message = "Prepared payload (no API call). Note: AccountingConnection is not CONNECTED yet.";
    await writeLog({
      provider: input.provider,
      entityType: input.entityType,
      internalId: input.internalId,
      direction: AccountingSyncDirection.PUSH,
      status: AccountingSyncStatus.SUCCESS,
      message,
    });
    return {
      provider: input.provider,
      entityType: input.entityType,
      internalId: input.internalId,
      status: AccountingSyncStatus.SUCCESS,
      message,
    };
  }

  // Foundation only: still do not call Xero. We just confirm config and capture a log.
  const message = "Prepared payload (no API call). Xero runtime configured; OAuth sync to be implemented.";
  await writeLog({
    provider: input.provider,
    entityType: input.entityType,
    internalId: input.internalId,
    direction: AccountingSyncDirection.PUSH,
    status: AccountingSyncStatus.SUCCESS,
    message,
  });

  return {
    provider: input.provider,
    entityType: input.entityType,
    internalId: input.internalId,
    status: AccountingSyncStatus.SUCCESS,
    message,
  };
}

export async function syncInvoiceToXero(invoiceId: string): Promise<SyncResult> {
  const provider = AccountingProvider.XERO;
  const connection = await connectionStatus(provider);

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      project: { include: { client: true } },
    },
  });
  if (!invoice) {
    const message = "Invoice not found.";
    await writeLog({
      provider,
      entityType: AccountingSyncEntityType.INVOICE,
      internalId: invoiceId,
      direction: AccountingSyncDirection.PUSH,
      status: AccountingSyncStatus.FAILED,
      message,
    });
    return { provider, entityType: AccountingSyncEntityType.INVOICE, internalId: invoiceId, status: AccountingSyncStatus.FAILED, message };
  }

  const taxCode = gstTaxCodeHint(invoice.taxAmount);
  const payload = mapInvoiceToXeroPayload({ invoice, taxCode });
  return dryRunOrSkip({
    provider,
    entityType: AccountingSyncEntityType.INVOICE,
    internalId: invoiceId,
    payload,
    connection,
  });
}

export async function syncSupplierBillToXero(billId: string): Promise<SyncResult> {
  const provider = AccountingProvider.XERO;
  const connection = await connectionStatus(provider);

  const bill = await prisma.supplierBill.findUnique({
    where: { id: billId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, supplier: { include: { contacts: true } } },
  });
  if (!bill) {
    const message = "Supplier bill not found.";
    await writeLog({
      provider,
      entityType: AccountingSyncEntityType.SUPPLIER_BILL,
      internalId: billId,
      direction: AccountingSyncDirection.PUSH,
      status: AccountingSyncStatus.FAILED,
      message,
    });
    return { provider, entityType: AccountingSyncEntityType.SUPPLIER_BILL, internalId: billId, status: AccountingSyncStatus.FAILED, message };
  }

  const taxCode = gstTaxCodeHint(bill.taxAmount);
  const payload = mapSupplierBillToXeroPayload({ bill, taxCode });
  return dryRunOrSkip({
    provider,
    entityType: AccountingSyncEntityType.SUPPLIER_BILL,
    internalId: billId,
    payload,
    connection,
  });
}

export async function syncPaymentReceiptToXero(receiptId: string): Promise<SyncResult> {
  const provider = AccountingProvider.XERO;
  const connection = await connectionStatus(provider);

  const receipt = await prisma.paymentReceipt.findUnique({
    where: { id: receiptId },
    include: { invoice: { select: { invoiceNumber: true } } },
  });
  if (!receipt) {
    const message = "Receipt not found.";
    await writeLog({
      provider,
      entityType: AccountingSyncEntityType.PAYMENT_RECEIPT,
      internalId: receiptId,
      direction: AccountingSyncDirection.PUSH,
      status: AccountingSyncStatus.FAILED,
      message,
    });
    return { provider, entityType: AccountingSyncEntityType.PAYMENT_RECEIPT, internalId: receiptId, status: AccountingSyncStatus.FAILED, message };
  }

  const payload = mapReceiptToXeroPayload({ receipt });
  return dryRunOrSkip({
    provider,
    entityType: AccountingSyncEntityType.PAYMENT_RECEIPT,
    internalId: receiptId,
    payload,
    connection,
  });
}

export async function syncContactsToXero(params?: { take?: number }): Promise<{ count: number; status: AccountingSyncStatus; message: string }> {
  const provider = AccountingProvider.XERO;
  const connection = await connectionStatus(provider);
  const take = Math.min(200, Math.max(1, params?.take ?? 50));

  const [clients, vendors] = await Promise.all([
    prisma.client.findMany({
      orderBy: [{ createdAt: "desc" }],
      take,
      include: { contacts: true },
    }),
    prisma.vendor.findMany({
      orderBy: [{ createdAt: "desc" }],
      take,
      include: { contacts: true },
    }),
  ]);

  const client = await getXeroClientIfConfigured();
  if (!client) {
    const message =
      "Skipped: Xero env not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI, XERO_TENANT_ID, XERO_ACCESS_TOKEN.";
    // log a single row for the batch trigger (internalId blanked)
    await writeLog({
      provider,
      entityType: AccountingSyncEntityType.CLIENT,
      internalId: "batch",
      direction: AccountingSyncDirection.PUSH,
      status: AccountingSyncStatus.SKIPPED,
      message,
    });
    return { count: 0, status: AccountingSyncStatus.SKIPPED, message };
  }

  const message =
    connection?.status === "CONNECTED"
      ? "Prepared contacts payloads (no API call)."
      : "Prepared contacts payloads (no API call). Note: AccountingConnection is not CONNECTED yet.";

  for (const c of clients) {
    const payload = mapClientToXeroPayload({ client: c });
    await dryRunOrSkip({
      provider,
      entityType: AccountingSyncEntityType.CLIENT,
      internalId: c.id,
      payload,
      connection,
    });
  }

  for (const v of vendors) {
    const payload = mapVendorToXeroPayload({ vendor: v });
    await dryRunOrSkip({
      provider,
      entityType: AccountingSyncEntityType.VENDOR,
      internalId: v.id,
      payload,
      connection,
    });
  }

  return { count: clients.length + vendors.length, status: AccountingSyncStatus.SUCCESS, message };
}

export async function syncItemsToXero(params?: { take?: number }): Promise<{ count: number; status: AccountingSyncStatus; message: string }> {
  const provider = AccountingProvider.XERO;
  const connection = await connectionStatus(provider);
  const take = Math.min(500, Math.max(1, params?.take ?? 100));

  const items = await prisma.itemMaster.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take,
  });

  const client = await getXeroClientIfConfigured();
  if (!client) {
    const message =
      "Skipped: Xero env not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI, XERO_TENANT_ID, XERO_ACCESS_TOKEN.";
    await writeLog({
      provider,
      entityType: AccountingSyncEntityType.ITEM_MASTER,
      internalId: "batch",
      direction: AccountingSyncDirection.PUSH,
      status: AccountingSyncStatus.SKIPPED,
      message,
    });
    return { count: 0, status: AccountingSyncStatus.SKIPPED, message };
  }

  const message =
    connection?.status === "CONNECTED"
      ? "Prepared item payloads (no API call)."
      : "Prepared item payloads (no API call). Note: AccountingConnection is not CONNECTED yet.";

  for (const item of items) {
    const payload = mapItemMasterToXeroPayload({ item });
    await dryRunOrSkip({
      provider,
      entityType: AccountingSyncEntityType.ITEM_MASTER,
      internalId: item.id,
      payload,
      connection,
    });
  }

  return { count: items.length, status: AccountingSyncStatus.SUCCESS, message };
}

