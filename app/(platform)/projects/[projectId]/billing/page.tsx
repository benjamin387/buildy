import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PaymentScheduleTable } from "@/app/(platform)/projects/[projectId]/invoices/components/payment-schedule-table";
import { createInvoiceFromScheduleAction, generatePaymentScheduleAction } from "@/app/(platform)/projects/[projectId]/invoices/actions";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function BillingDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.INVOICE_READ, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const signedContract = await prisma.contract.findFirst({
    where: { projectId, status: "SIGNED" },
    orderBy: { contractDate: "desc" },
    select: { id: true, contractNumber: true, contractDate: true },
  });

  const approvedQuotation = await prisma.quotation.findFirst({
    where: { projectId, status: "APPROVED" },
    orderBy: { issueDate: "desc" },
    select: { id: true, quotationNumber: true, issueDate: true },
  });

  const schedules = await prisma.paymentSchedule.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const totals = schedules.reduce(
    (acc, s) => {
      acc.scheduled += Number(s.scheduledAmount);
      acc.billed += Number(s.billedAmount);
      acc.paid += Number(s.paidAmount);
      return acc;
    },
    { scheduled: 0, billed: 0, paid: 0 },
  );
  const outstanding = Math.max(totals.scheduled - totals.paid, 0);

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Progressive Billing
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Billing Dashboard
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Generate schedules from contract milestones or quotation payment terms, then issue invoices against stages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/invoices`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Invoice Register
          </Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Scheduled (Net)" value={formatCurrency(totals.scheduled)} />
        <Metric title="Billed (Net)" value={formatCurrency(totals.billed)} />
        <Metric title="Paid (Net)" value={formatCurrency(totals.paid)} />
        <Metric title="Outstanding (Net)" value={formatCurrency(outstanding)} />
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-950">Payment Schedules</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Stage amounts are tracked net of GST. Receipts update stage paid totals using a proportional allocation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form action={generatePaymentScheduleAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="source" value="contract" />
              <button
                disabled={!signedContract}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Generate From Signed Contract
              </button>
            </form>

            <form action={generatePaymentScheduleAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="source" value="quotation" />
              <button
                disabled={!approvedQuotation}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Generate From Approved Quotation
              </button>
            </form>
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-neutral-700">
          <Info label="Signed contract" value={signedContract ? signedContract.contractNumber : "-"} />
          <Info label="Approved quotation" value={approvedQuotation ? approvedQuotation.quotationNumber : "-"} />
        </div>

        {schedules.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6">
            <p className="text-sm font-semibold text-neutral-900">No schedules yet</p>
            <p className="mt-2 text-sm text-neutral-600">
              Generate a schedule from the signed contract (recommended) or an approved quotation payment terms.
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <PaymentScheduleTable
              projectId={projectId}
              schedules={schedules}
              renderAction={(scheduleId, status) => {
                const disabled = status === "PAID" || status === "CANCELLED";
                return (
                  <form action={createInvoiceFromScheduleAction} className="flex items-center gap-2">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="paymentScheduleId" value={scheduleId} />
                    <input
                      name="issueDate"
                      type="date"
                      defaultValue={todayIsoDate()}
                      className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                    />
                    <button
                      disabled={disabled}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Create Invoice
                    </button>
                  </form>
                );
              }}
            />
          </div>
        )}
      </section>
    </main>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
    </div>
  );
}

function Info(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-neutral-600">{props.label}</span>
      <span className="font-medium text-neutral-900">{props.value}</span>
    </div>
  );
}

