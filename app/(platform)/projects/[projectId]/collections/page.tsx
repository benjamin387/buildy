import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { computeCollectionsSummary, listCollectionActionsDueToday, listCollectionCases } from "@/lib/collections/service";
import { refreshCollectionsAction } from "@/app/(platform)/collections/actions";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ProjectCollectionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.INVOICE_READ, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, projectCode: true },
  });
  if (!project) notFound();

  const summary = await computeCollectionsSummary({ projectId });
  const todaysActions = await listCollectionActionsDueToday({ projectId });
  const cases = await listCollectionCases({ projectId });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Collections
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Overdue Receivables
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Project: <span className="font-medium text-neutral-900">{project.name}</span>{" "}
            <span className="text-neutral-500">
              ({project.projectCode ?? project.id.slice(0, 8)})
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={refreshCollectionsAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Refresh Overdue Cases
            </button>
          </form>
          <Link
            href="/collections"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            All Collections
          </Link>
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Overdue Amount" value={formatCurrency(summary.overdueAmount)} tone={summary.overdueAmount > 0 ? "risk" : "ok"} />
        <Metric title="Open Cases" value={`${summary.openCases}`} />
        <Metric title="Critical Cases" value={`${summary.criticalCases}`} tone={summary.criticalCases > 0 ? "risk" : "ok"} />
        <Metric title="Cases Due Today" value={`${summary.casesDueToday}`} tone={summary.casesDueToday > 0 ? "warn" : "ok"} />
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Today’s Actions</h2>
          <p className="mt-1 text-sm text-neutral-600">Actions scheduled for today for this project.</p>
        </div>
        {todaysActions.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No actions scheduled for today.</div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Scheduled</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                  <th className="px-4 py-4 text-left font-semibold">Channel</th>
                  <th className="px-4 py-4 text-left font-semibold">Case</th>
                  <th className="px-4 py-4 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-4 text-right font-semibold">Outstanding</th>
                  <th className="px-4 py-4 text-left font-semibold">Open</th>
                </tr>
              </thead>
              <tbody>
                {todaysActions.map((a) => (
                  <tr key={a.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 text-neutral-900">{formatDate(a.scheduledAt)}</td>
                    <td className="px-4 py-4 text-neutral-900">
                      <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-700">
                        {a.actionType}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{a.channel}</td>
                    <td className="px-4 py-4 font-medium text-neutral-900">{a.case.caseNumber}</td>
                    <td className="px-4 py-4 text-neutral-900">{a.case.invoice.invoiceNumber}</td>
                    <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">
                      {formatCurrency(Number(a.case.invoice.outstandingAmount))}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/collections/${a.caseId}`}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-neutral-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-neutral-950">Cases</h2>
          <Link
            href={`/projects/${projectId}/invoices`}
            className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
          >
            View Invoices
          </Link>
        </div>

        {cases.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No cases yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Case</th>
                  <th className="px-4 py-4 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-4 text-left font-semibold">Debtor</th>
                  <th className="px-4 py-4 text-right font-semibold">Outstanding</th>
                  <th className="px-4 py-4 text-right font-semibold">DPD</th>
                  <th className="px-4 py-4 text-left font-semibold">Severity</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Next Action</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 font-medium text-neutral-900">{c.caseNumber}</td>
                    <td className="px-4 py-4 text-neutral-900">{c.invoice.invoiceNumber}</td>
                    <td className="px-4 py-4 text-neutral-900">{c.debtorName}</td>
                    <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">
                      {formatCurrency(Number(c.outstandingAmount))}
                    </td>
                    <td className="px-4 py-4 text-right text-neutral-900 tabular-nums">{c.daysPastDue}</td>
                    <td className="px-4 py-4">
                      <SeverityBadge severity={c.severity} />
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{c.status}</td>
                    <td className="px-4 py-4 text-neutral-700">{formatDate(c.nextActionDate)}</td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/collections/${c.id}`}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                      >
                        View
                      </Link>
                    </td>
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

function Metric(props: { title: string; value: string; tone?: "ok" | "warn" | "risk" }) {
  const tone =
    props.tone === "risk"
      ? "border-red-200 bg-red-50"
      : props.tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-neutral-200 bg-neutral-50";
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold text-neutral-950 tabular-nums">{props.value}</p>
    </div>
  );
}

function SeverityBadge(props: { severity: string }) {
  const tone =
    props.severity === "CRITICAL"
      ? "bg-red-50 text-red-700 border-red-200"
      : props.severity === "HIGH"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : props.severity === "MEDIUM"
          ? "bg-yellow-50 text-yellow-800 border-yellow-200"
          : "bg-neutral-100 text-neutral-700 border-neutral-200";
  return (
    <span
      className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone}`}
    >
      {props.severity}
    </span>
  );
}
