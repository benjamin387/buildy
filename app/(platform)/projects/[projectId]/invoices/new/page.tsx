import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceType, Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { createInvoiceFromScheduleAction, createManualInvoiceAction } from "@/app/(platform)/projects/[projectId]/invoices/actions";
import { InvoiceLinesEditor } from "@/app/(platform)/projects/[projectId]/invoices/components/invoice-lines-editor";

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { commercialProfile: true, client: true },
  });
  if (!project) notFound();

  const schedules = await prisma.paymentSchedule.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const contracts = await prisma.contract.findMany({
    where: { projectId },
    orderBy: [{ contractDate: "desc" }],
    take: 10,
  });

  const quotations = await prisma.quotation.findMany({
    where: { projectId },
    orderBy: [{ issueDate: "desc" }],
    take: 10,
  });

  const variationOrders = await prisma.variationOrder.findMany({
    where: { projectId, status: "APPROVED" },
    orderBy: [{ createdAt: "desc" }],
    take: 20,
  });

  const gstRate = project.commercialProfile?.gstRate ? Number(project.commercialProfile.gstRate) : 0.09;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Invoice Creation
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            New Invoice
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Create invoices manually or generate them from progressive billing schedules. Totals are GST-ready and recalculated server-side on save.
          </p>
        </div>

        <Link
          href={`/projects/${projectId}/invoices`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Back
        </Link>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">From Payment Schedule</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Generate a draft invoice from a schedule stage (contract milestone or quotation payment term).
        </p>

        {schedules.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6">
            <p className="text-sm font-semibold text-neutral-900">No payment schedule items found.</p>
            <p className="mt-2 text-sm text-neutral-600">
              Create or generate a schedule in the Billing dashboard, then come back to generate invoices.
            </p>
            <Link
              href={`/projects/${projectId}/billing`}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Go to Billing Dashboard
            </Link>
          </div>
        ) : (
          <form action={createInvoiceFromScheduleAction} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="projectId" value={projectId} />

            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Schedule Stage</span>
              <select
                name="paymentScheduleId"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                defaultValue={schedules[0]?.id ?? ""}
              >
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {s.status} · Scheduled {Number(s.scheduledAmount).toFixed(2)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Invoice Type</span>
              <select
                name="invoiceType"
                defaultValue={InvoiceType.PROGRESS}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              >
                <option value={InvoiceType.DEPOSIT}>Deposit</option>
                <option value={InvoiceType.PROGRESS}>Progress</option>
                <option value={InvoiceType.FINAL}>Final</option>
                <option value={InvoiceType.VARIATION}>Variation</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Issue Date</span>
              <input
                name="issueDate"
                type="date"
                required
                defaultValue={todayIsoDate()}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Due Date (optional)</span>
              <input
                name="dueDate"
                type="date"
                defaultValue=""
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <div className="sm:col-span-2 flex justify-end">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Create Draft Invoice
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Manual Invoice</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Build a draft invoice (ad-hoc billing, variations, additional works). You can link it to a contract/quotation/VO for audit and later accounting export.
        </p>

        <form action={createManualInvoiceAction} className="mt-5 grid gap-6">
          <input type="hidden" name="projectId" value={projectId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Invoice Type</span>
              <select
                name="invoiceType"
                defaultValue={InvoiceType.PROGRESS}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              >
                <option value={InvoiceType.DEPOSIT}>Deposit</option>
                <option value={InvoiceType.PROGRESS}>Progress</option>
                <option value={InvoiceType.FINAL}>Final</option>
                <option value={InvoiceType.VARIATION}>Variation</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Issue Date</span>
              <input
                name="issueDate"
                type="date"
                required
                defaultValue={todayIsoDate()}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Due Date (optional)</span>
              <input
                name="dueDate"
                type="date"
                defaultValue=""
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Title (optional)</span>
              <input
                name="title"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Progress claim #1"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Link Contract (optional)</span>
              <select
                name="contractId"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                defaultValue={contracts[0]?.id ?? ""}
              >
                <option value="">Not linked</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contractNumber} · {c.status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Link Quotation (optional)</span>
              <select
                name="quotationId"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                defaultValue={quotations[0]?.id ?? ""}
              >
                <option value="">Not linked</option>
                {quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.quotationNumber} · {q.status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Link Approved VO (optional)</span>
              <select
                name="variationOrderId"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                defaultValue=""
              >
                <option value="">Not linked</option>
                {variationOrders.map((vo) => (
                  <option key={vo.id} value={vo.id}>
                    {vo.referenceNumber} · {vo.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Notes (optional)</span>
            <textarea
              name="notes"
              rows={3}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Payment instructions / bank details / remarks"
            />
          </label>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Line Items
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              Currency: SGD · GST rate: {(gstRate * 100).toFixed(2)}%
            </p>
            <div className="mt-4">
              <InvoiceLinesEditor
                name="linesJson"
                gstRate={gstRate}
                discountFieldId="manual-discount"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Create Draft Invoice
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

