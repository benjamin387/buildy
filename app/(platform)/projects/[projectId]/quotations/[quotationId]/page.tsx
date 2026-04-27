import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission, UpsellStatus } from "@prisma/client";
import { getProjectPermissions, requirePermission, requireUserId } from "@/lib/rbac";
import { QuotationStatusActions } from "@/app/(platform)/projects/[projectId]/quotations/[quotationId]/status-actions";
import { MessagingPanel } from "@/app/(platform)/components/messaging-panel";
import { ClientDeliveryActions } from "@/app/(platform)/components/client-delivery-actions";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { AISalesAssistantPanel } from "@/app/(platform)/components/ai-sales-assistant-panel";
import { ActivityTimeline } from "@/app/components/timeline/activity-timeline";
import {
  generateUpsellRecommendationsAction,
  pushUpsellToQuotationAction,
  updateUpsellStatusAction,
} from "@/app/(platform)/projects/[projectId]/upsell/actions";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default async function ProjectQuotationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; quotationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, quotationId } = await params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const userId = await requireUserId();
  const permissions = await getProjectPermissions({ userId, projectId });
  const canWrite = permissions.has(Permission.QUOTE_WRITE);
  const canApprove = permissions.has(Permission.QUOTE_APPROVE);

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      paymentTermsV2: { orderBy: { sortOrder: "asc" } },
      sections: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      project: { include: { client: true } },
    },
  });

  if (!quotation || quotation.projectId !== projectId) notFound();

  const upsells = await prisma.upsellRecommendation.findMany({
    where: { projectId, status: { not: "REJECTED" } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 6,
  });

  const totalAmount = Number(quotation.totalAmount);
  const gstAmount = Number(quotation.gstAmount);
  const profitAmount = Number(quotation.profitAmount);
  const estimatedCost = Number(quotation.estimatedCost);
  const sp = await searchParams;
  const deliveryToken = typeof sp.deliveryToken === "string" ? sp.deliveryToken : null;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/quotations`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              {quotation.status}
            </span>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              V{quotation.version}
            </span>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Quotation Detail
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {quotation.quotationNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Issue {formatDate(quotation.issueDate)} · {quotation.projectNameSnapshot} ·{" "}
            {quotation.clientNameSnapshot}
          </p>
        </div>

        <div className="grid gap-2 rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Subtotal</p>
            <p className="text-xl font-semibold">{formatCurrency(Number(quotation.subtotal))}</p>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">GST</p>
            <p className="text-xl font-semibold">{formatCurrency(gstAmount)}</p>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Total</p>
            <p className="text-xl font-semibold">{formatCurrency(totalAmount)}</p>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Est Cost</p>
            <p className="text-xl font-semibold">{formatCurrency(estimatedCost)}</p>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Profit</p>
            <p className="text-xl font-semibold">{formatCurrency(profitAmount)}</p>
          </div>
          <p className="text-xs text-neutral-300">
            Margin {formatPct(Number(quotation.marginPercent))}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={`/projects/${projectId}/quotations/${quotationId}/print`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Print / Save as PDF
        </Link>
        {canWrite ? (
          <Link
            href={`/projects/${projectId}/quotations/${quotationId}/edit`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Edit
          </Link>
        ) : null}
      </div>

      <QuotationStatusActions
        projectId={projectId}
        quotationId={quotationId}
        status={quotation.status}
        canWrite={canWrite}
        canApprove={canApprove}
        isLatest={quotation.isLatest}
      />

      <ClientDeliveryActions
        returnTo={`/projects/${projectId}/quotations/${quotationId}`}
        projectId={projectId}
        documentType="QUOTATION"
        documentId={quotationId}
        deliveryToken={deliveryToken}
      />

      <AISalesAssistantPanel
        projectId={projectId}
        quotationId={quotationId}
        returnTo={`/projects/${projectId}/quotations/${quotationId}#ai-sales`}
        mode="QUOTATION"
      />

      <MessagingPanel
        returnTo={`/projects/${projectId}/quotations/${quotationId}`}
        projectId={projectId}
        relatedType="QUOTATION"
        relatedId={quotationId}
        documentType="QUOTATION"
        documentId={quotationId}
        defaultRecipientName={
          quotation.contactPersonSnapshot ||
          quotation.clientNameSnapshot ||
          quotation.project.clientName ||
          quotation.project.client?.name ||
          null
        }
        defaultRecipientEmail={
          quotation.contactEmailSnapshot ||
          quotation.project.clientEmail ||
          quotation.project.client?.email ||
          null
        }
        defaultRecipientPhone={
          quotation.contactPhoneSnapshot ||
          quotation.project.clientPhone ||
          quotation.project.client?.phone ||
          null
        }
        defaultSubject={`Quotation ${quotation.quotationNumber} (V${quotation.version}) - ${quotation.projectNameSnapshot}`}
        defaultBody={`Dear ${quotation.contactPersonSnapshot || quotation.clientNameSnapshot || "Client"},\n\nPlease find our quotation ${quotation.quotationNumber} for ${quotation.projectNameSnapshot}.\n\nThank you.`}
        defaultChannel="EMAIL"
      />

      <ActivityTimeline
        entityType="Quotation"
        entityId={quotationId}
        take={20}
        title="Quotation Timeline"
        description="Quotation edits, delivery actions, approvals and AI recommendations."
      />

      <section id="upsell" className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Upsell Engine</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Generate optional add-ons and push accepted items into a draft quotation (creates a draft revision if needed).
            </p>
          </div>
          <form action={generateUpsellRecommendationsAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="quotationId" value={quotationId} />
            <PendingSubmitButton pendingText="Generating...">Generate Upsells</PendingSubmitButton>
          </form>
        </div>

        {upsells.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-700">No upsell recommendations yet.</p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-neutral-200">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Priority</th>
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                  <th className="px-3 py-3 text-left font-semibold">Upsell</th>
                  <th className="px-3 py-3 text-right font-semibold">Revenue +</th>
                  <th className="px-3 py-3 text-right font-semibold">Profit +</th>
                  <th className="px-3 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {upsells.map((u) => (
                  <tr key={u.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3 text-neutral-700">{u.priority}</td>
                    <td className="px-3 py-3 text-neutral-700">{u.status}</td>
                    <td className="px-3 py-3 text-neutral-900">
                      <div className="flex flex-col">
                        <span className="font-semibold">{u.title}</span>
                        <span className="text-xs text-neutral-500">{u.category}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                      {formatCurrency(Number(u.estimatedRevenueIncrease))}
                    </td>
                    <td className="px-3 py-3 text-right text-neutral-700">
                      {formatCurrency(Number(u.estimatedProfitIncrease))}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={updateUpsellStatusAction} className="flex items-center gap-2">
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="upsellId" value={u.id} />
                          <input type="hidden" name="returnTo" value={`/projects/${projectId}/quotations/${quotationId}#upsell`} />
                          <select
                            name="status"
                            defaultValue={u.status}
                            className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                          >
                            {Object.values(UpsellStatus).map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                            Save
                          </button>
                        </form>
                        <form action={pushUpsellToQuotationAction}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="upsellId" value={u.id} />
                          <input type="hidden" name="returnTo" value={`/projects/${projectId}/quotations/${quotationId}#upsell`} />
                          <button className="inline-flex h-10 items-center justify-center rounded-xl bg-neutral-950 px-3 text-sm font-semibold text-white transition hover:bg-neutral-800">
                            Push to Draft Quote
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Payment Terms</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Staged payments captured on the quotation.
        </p>

        {quotation.paymentTermsV2.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-700">No staged payment terms.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Label</th>
                  <th className="px-3 py-3 text-right font-semibold">%</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                  <th className="px-3 py-3 text-left font-semibold">Trigger</th>
                  <th className="px-3 py-3 text-right font-semibold">Due Days</th>
                </tr>
              </thead>
              <tbody>
                {quotation.paymentTermsV2.map((term) => (
                  <tr key={term.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3 font-medium text-neutral-900">{term.title}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">
                      {term.percent === null ? "-" : `${Number(term.percent).toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-3 text-right text-neutral-900">
                      {term.amount === null ? "-" : formatCurrency(Number(term.amount))}
                    </td>
                    <td className="px-3 py-3 text-neutral-700">{term.triggerType ?? "-"}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">
                      {term.dueDays === null ? "-" : term.dueDays}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-6">
        {quotation.sections.map((section) => (
          <section
            key={section.id}
            className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">{section.title}</h2>
                {section.description ? (
                  <p className="mt-1 text-sm text-neutral-600">{section.description}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                  Section Subtotal
                </p>
                <p className="mt-1 text-lg font-semibold text-neutral-950">
                  {formatCurrency(Number(section.subtotal))}
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[1180px] w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-800">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold">SKU</th>
                    <th className="px-3 py-3 text-left font-semibold">Description</th>
                    <th className="px-3 py-3 text-left font-semibold">Unit</th>
                    <th className="px-3 py-3 text-right font-semibold">Qty</th>
                    <th className="px-3 py-3 text-right font-semibold">Unit Price</th>
                    <th className="px-3 py-3 text-right font-semibold">Cost Price</th>
                    <th className="px-3 py-3 text-right font-semibold">Total</th>
                    <th className="px-3 py-3 text-right font-semibold">Cost</th>
                    <th className="px-3 py-3 text-right font-semibold">Profit</th>
                    <th className="px-3 py-3 text-right font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {section.lineItems.map((item) => (
                    <tr key={item.id} className="border-t border-neutral-200">
                      <td className="px-3 py-3 text-neutral-700">{item.sku || "-"}</td>
                      <td className="px-3 py-3 text-neutral-900">{item.description}</td>
                      <td className="px-3 py-3 text-neutral-700">{item.unit}</td>
                      <td className="px-3 py-3 text-right text-neutral-700">{Number(item.quantity)}</td>
                      <td className="px-3 py-3 text-right text-neutral-900">
                        {formatCurrency(Number(item.unitPrice))}
                      </td>
                      <td className="px-3 py-3 text-right text-neutral-900">
                        {formatCurrency(Number(item.costPrice))}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-neutral-950">
                        {formatCurrency(Number(item.totalPrice))}
                      </td>
                      <td className="px-3 py-3 text-right text-neutral-900">
                        {formatCurrency(Number(item.totalCost))}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-neutral-950">
                        {formatCurrency(Number(item.profit))}
                      </td>
                      <td className="px-3 py-3 text-right text-neutral-900">
                        {formatPct(Number(item.marginPercent))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
