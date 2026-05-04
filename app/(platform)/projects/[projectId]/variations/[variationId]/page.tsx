import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission, type MessageChannel } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getVariationById } from "@/lib/variation-orders/service";
import { ClientDeliveryActions } from "@/app/(platform)/components/client-delivery-actions";
import { MessagingPanel } from "@/app/(platform)/components/messaging-panel";
import { ActivityTimeline } from "@/app/components/timeline/activity-timeline";
import { approveVariationInternalAction, createVariationInvoiceAction, rejectVariationInternalAction, submitVariationForApprovalAction, reviseRejectedVariationAction } from "@/app/(platform)/projects/[projectId]/variations/actions";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function statusBadge(status: string): string {
  if (status === "APPROVED" || status === "INVOICED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PENDING_APPROVAL") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  return "border-neutral-300 bg-neutral-50 text-neutral-700";
}

export default async function VariationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; variationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, variationId } = await params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const vo = await getVariationById({ projectId, variationId });
  if (!vo) notFound();

  const sp = await searchParams;
  const deliveryToken = typeof sp.deliveryToken === "string" ? sp.deliveryToken : null;

  const revenue = Number(vo.subtotal);
  const cost = Number(vo.costSubtotal);
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const canEdit = vo.status === "DRAFT";
  const canSubmit = vo.status === "DRAFT";
  const canApprove = vo.status === "PENDING_APPROVAL";
  const canInvoice = vo.status === "APPROVED";
  const canReviseRejected = vo.status === "REJECTED";

  const defaultApproverName = vo.project.clientName || vo.project.client?.name || "Client";
  const defaultApproverEmail = vo.project.clientEmail || vo.project.client?.email || "";

  const returnTo = `/projects/${projectId}/variations/${variationId}`;

  const defaultChannel: MessageChannel = "EMAIL";

  return (
    <main className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Project / Variation Order
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {vo.referenceNumber}
            </h1>
            <p className="mt-2 text-sm text-neutral-700">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusBadge(vo.status)}`}>
                {vo.status}
              </span>
            </p>
            <p className="mt-3 text-sm text-neutral-600">
              {vo.title}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${projectId}/variations`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <Link
              href={`/projects/${projectId}/variations/${variationId}/print`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Print
            </Link>
            {canEdit ? (
              <Link
                href={`/projects/${projectId}/variations/${variationId}/edit`}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Edit Draft
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="VO Revenue (net)" value={formatCurrency(revenue)} />
        <MetricCard label="VO Est Cost" value={formatCurrency(cost)} />
        <MetricCard label="VO Profit" value={formatCurrency(profit)} />
        <MetricCard label="VO Margin" value={`${margin.toFixed(1)}%`} />
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Header</h2>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Project" value={`${vo.project.projectCode ?? vo.project.id.slice(0, 8)} · ${vo.project.name}`} />
          <Row label="Client" value={vo.project.clientName || vo.project.client?.name || "-"} />
          <Row label="Requested By" value={vo.requestedBy ?? "-"} />
          <Row label="Reason" value={vo.reason ?? "-"} />
          <Row label="Time Impact" value={`${vo.timeImpactDays ?? 0} days`} />
          <Row label="Submitted" value={formatDateTime(vo.submittedAt)} />
          <Row label="Approved" value={formatDateTime(vo.approvedAt)} />
          <Row label="Rejected" value={formatDateTime(vo.rejectedAt)} />
        </div>
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Description</p>
          <p className="mt-2 whitespace-pre-wrap leading-6 text-neutral-800">{vo.description ?? "-"}</p>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Items</h2>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">SKU</th>
                <th className="px-3 py-3 text-left font-semibold">Description</th>
                <th className="px-3 py-3 text-left font-semibold">Unit</th>
                <th className="px-3 py-3 text-right font-semibold">Qty</th>
                <th className="px-3 py-3 text-right font-semibold">Unit Price</th>
                <th className="px-3 py-3 text-right font-semibold">Total</th>
                <th className="px-3 py-3 text-right font-semibold">Cost Price</th>
                <th className="px-3 py-3 text-right font-semibold">Cost Total</th>
                <th className="px-3 py-3 text-right font-semibold">Profit</th>
                <th className="px-3 py-3 text-right font-semibold">Margin</th>
              </tr>
            </thead>
            <tbody>
              {vo.lineItems.map((l) => (
                <tr key={l.id} className="border-t border-neutral-200">
                  <td className="px-3 py-3 text-neutral-700">{l.sku ?? "-"}</td>
                  <td className="px-3 py-3 text-neutral-900">{l.description}</td>
                  <td className="px-3 py-3 text-neutral-700">{l.unit}</td>
                  <td className="px-3 py-3 text-right text-neutral-900">{Number(l.quantity).toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-neutral-900">{formatCurrency(Number(l.unitPrice))}</td>
                  <td className="px-3 py-3 text-right font-medium text-neutral-900">{formatCurrency(Number(l.totalPrice))}</td>
                  <td className="px-3 py-3 text-right text-neutral-900">{formatCurrency(Number(l.costPrice))}</td>
                  <td className="px-3 py-3 text-right font-medium text-neutral-900">{formatCurrency(Number(l.totalCost))}</td>
                  <td className="px-3 py-3 text-right font-medium text-neutral-900">{formatCurrency(Number(l.profitAmount))}</td>
                  <td className="px-3 py-3 text-right text-neutral-700">{Number(l.marginPercent).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <Row label="Subtotal (net)" value={formatCurrency(Number(vo.subtotal))} align="right" />
            <Row label="GST" value={formatCurrency(Number(vo.gstAmount))} align="right" />
            <Row label="Total (gross)" value={formatCurrency(Number(vo.totalAmount))} align="right" strong />
            <Row label="Estimated Cost" value={formatCurrency(Number(vo.costSubtotal))} align="right" />
          </div>
        </div>
      </section>

      {canSubmit ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Submit For Approval</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Submitting locks the draft. Use secure link delivery to obtain client approval before execution or invoicing.
          </p>
          <form action={submitVariationForApprovalAction} className="mt-5 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="variationId" value={variationId} />
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Approver Name</span>
              <input
                name="approverName"
                required
                defaultValue={defaultApproverName}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Approver Email</span>
              <input
                name="approverEmail"
                required
                defaultValue={defaultApproverEmail}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Role</span>
              <input
                name="approverRole"
                required
                defaultValue="CLIENT"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
            <button className="sm:col-span-3 inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Submit VO
            </button>
          </form>
        </section>
      ) : null}

      {canApprove ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Internal Approval</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Internal approval sets the VO as approved for contract value and billing. Client approval can still be captured via secure link.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={approveVariationInternalAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="variationId" value={variationId} />
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Approve
              </button>
            </form>
            <form action={rejectVariationInternalAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="variationId" value={variationId} />
              <input
                name="remarks"
                placeholder="Rejection remarks (optional)"
                className="h-11 w-72 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              />
              <button className="ml-2 inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                Reject
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {canInvoice ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Invoice</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Create a draft VARIATION invoice from the approved VO items.
          </p>
          <form action={createVariationInvoiceAction} className="mt-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="variationId" value={variationId} />
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Create Variation Invoice
            </button>
          </form>
        </section>
      ) : null}

      {canReviseRejected ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Revise Rejected VO</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Create a new draft VO based on this rejected version. The rejected version remains viewable for audit.
          </p>
          <form action={reviseRejectedVariationAction} className="mt-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="variationId" value={variationId} />
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Create Revised Draft
            </button>
          </form>
        </section>
      ) : null}

      <ClientDeliveryActions
        returnTo={returnTo}
        projectId={projectId}
        documentType="VARIATION_ORDER"
        documentId={variationId}
        deliveryToken={deliveryToken}
      />

      <MessagingPanel
        returnTo={returnTo}
        projectId={projectId}
        relatedType="VARIATION_ORDER"
        relatedId={variationId}
        documentType="VARIATION_ORDER"
        documentId={variationId}
        defaultRecipientName={defaultApproverName}
        defaultRecipientEmail={defaultApproverEmail}
        defaultRecipientPhone={vo.project.clientPhone ?? vo.project.client?.phone ?? null}
        defaultSubject={`Variation Order ${vo.referenceNumber} for approval`}
        defaultBody={`Hi ${defaultApproverName},\n\nPlease review and approve the attached Variation Order (${vo.referenceNumber}).\n\nThank you.`}
        defaultChannel={defaultChannel}
      />

      <ActivityTimeline
        entityType="VariationOrder"
        entityId={variationId}
        take={20}
        title="Variation Timeline"
        description="Draft changes, approvals/rejections, delivery and invoicing."
      />

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Approvals</h2>
        </div>
        {vo.approvals.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No approval records yet.</div>
        ) : (
          <div className="overflow-x-auto p-6">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Approver</th>
                  <th className="px-4 py-3 text-left font-semibold">Email</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Approved</th>
                  <th className="px-4 py-3 text-left font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {vo.approvals.map((a) => (
                  <tr key={a.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 font-medium text-neutral-950">{a.approverName}</td>
                    <td className="px-4 py-3 text-neutral-700">{a.approverEmail}</td>
                    <td className="px-4 py-3 text-neutral-700">{a.role}</td>
                    <td className="px-4 py-3 text-neutral-700">{a.status}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDateTime(a.approvedAt)}</td>
                    <td className="px-4 py-3 text-neutral-700">{a.remarks ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Invoices Linked</h2>
        </div>
        {vo.invoices.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No invoices created from this VO yet.</div>
        ) : (
          <div className="overflow-x-auto p-6">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {vo.invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 font-medium text-neutral-950">
                      <Link href={`/projects/${projectId}/invoices/${inv.id}`} className="hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{inv.status}</td>
                    <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(Number(inv.totalAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Row(props: { label: string; value: string; align?: "left" | "right"; strong?: boolean }) {
  const align = props.align ?? "left";
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <span className="text-neutral-600">{props.label}</span>
      <span className={`${align === "right" ? "text-right" : ""} ${props.strong ? "font-semibold text-neutral-950" : "font-medium text-neutral-900"}`}>
        {props.value}
      </span>
    </div>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
    </div>
  );
}
