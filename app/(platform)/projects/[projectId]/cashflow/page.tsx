import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { parseCashflowAssumptions } from "@/lib/cashflow/assumptions";
import { computeProjectCashflowForecast } from "@/lib/cashflow/service";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function riskBadgeClass(risk: string): string {
  switch (risk) {
    case "CRITICAL":
      return "border-red-200 bg-red-50 text-red-700";
    case "HIGH":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "MEDIUM":
      return "border-yellow-200 bg-yellow-50 text-yellow-800";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

export default async function ProjectCashflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PNL_READ, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, projectCode: true, clientName: true, siteAddress: true, addressLine1: true },
  });
  if (!project) notFound();

  const assumptions = parseCashflowAssumptions(await searchParams);
  const forecast = await computeProjectCashflowForecast(projectId, assumptions);

  const remainingMilestones = forecast.lines.filter((l) => l.direction === "INFLOW").slice(0, 40);
  const exposure = forecast.lines.filter((l) => l.direction === "OUTFLOW").slice(0, 40);

  return (
    <main className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Project / Cashflow
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {project.projectCode ? `${project.projectCode} · ` : ""}
              {project.name}
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              {project.clientName ?? "-"} · {project.siteAddress || project.addressLine1 || "-"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${projectId}/pnl`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              View P&amp;L
            </Link>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${riskBadgeClass(forecast.riskLevel)}`}>
              {forecast.riskLevel}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <SummaryCard title="Expected Collections" value={formatCurrency(forecast.expectedInflows)} />
        <SummaryCard title="Expected Supplier Payouts" value={formatCurrency(forecast.expectedOutflows)} />
        <SummaryCard title="Net Cash Position" value={formatCurrency(forecast.netCashflow)} />
        <SummaryCard title="Overdue Receivables" value={formatCurrency(forecast.overdueReceivables)} />
        <SummaryCard title="Overdue Payables" value={formatCurrency(forecast.overduePayables)} />
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Forecast Windows</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {forecast.windows.map((w) => (
            <div key={w.days} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Next {w.days} days
              </p>
              <p className="mt-3 text-sm text-neutral-700">Net</p>
              <p className="text-lg font-semibold text-neutral-950">{formatCurrency(w.net)}</p>
              <p className="mt-2 text-xs text-neutral-600">
                In {formatCurrency(w.inflows)} · Out {formatCurrency(w.outflows)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Remaining Billing / Collections</h2>
          <p className="mt-1 text-sm text-neutral-600">Invoices outstanding and future billing stages.</p>
          <LinesTable lines={remainingMilestones} />
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Supplier Exposure</h2>
          <p className="mt-1 text-sm text-neutral-600">Supplier bills, PO commitments, and subcontract claims.</p>
          <LinesTable lines={exposure} />
        </section>
      </section>
    </main>
  );
}

function SummaryCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
    </div>
  );
}

function LinesTable(props: {
  lines: Array<{
    direction: string;
    label: string;
    expectedDate: Date;
    amount: number;
    status: string;
    sourceType: string;
  }>;
}) {
  if (props.lines.length === 0) return <p className="mt-4 text-sm text-neutral-600">No lines.</p>;
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-neutral-200">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-100 text-neutral-800">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Expected</th>
            <th className="px-4 py-3 text-left font-semibold">Label</th>
            <th className="px-4 py-3 text-left font-semibold">Type</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {props.lines.map((l, idx) => (
            <tr key={`${l.sourceType}:${l.label}:${idx}`} className="border-t border-neutral-200 bg-white">
              <td className="px-4 py-3 text-neutral-700">
                {new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(l.expectedDate)}
              </td>
              <td className="px-4 py-3 text-neutral-900">{l.label}</td>
              <td className="px-4 py-3 text-neutral-700">{l.sourceType}</td>
              <td className="px-4 py-3 text-neutral-700">{l.status}</td>
              <td className="px-4 py-3 text-right font-medium text-neutral-900">{formatCurrency(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

