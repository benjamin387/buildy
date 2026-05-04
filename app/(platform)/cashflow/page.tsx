import Link from "next/link";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { parseCashflowAssumptions } from "@/lib/cashflow/assumptions";
import { computeCompanyCashflowForecast } from "@/lib/cashflow/service";

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

function Row(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-neutral-600">{props.label}</span>
      <span className={props.strong ? "font-semibold text-neutral-950" : "font-medium text-neutral-900"}>
        {props.value}
      </span>
    </div>
  );
}

export default async function CashflowDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission({ permission: Permission.PNL_READ });

  const sp = await searchParams;
  const assumptions = parseCashflowAssumptions(sp);
  const forecast = await computeCompanyCashflowForecast(assumptions);

  const negative = forecast.projectRanking.filter((p) => p.net30 < 0).slice(0, 10);
  const mostPositive = forecast.projectRanking.slice().reverse().slice(0, 10);

  return (
    <main className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Finance / Cashflow
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              Cashflow Forecast
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Forecast company cashflow using invoices, billing schedules, supplier bills, purchase orders, and subcontract claims.
              This is a computed view (no snapshot saved by default).
            </p>
          </div>
          <Link
            href="/projects"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Open Projects
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Assumptions</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Simple controls for forecast horizon and delays. Values apply to this page via query params.
        </p>
        <form className="mt-5 grid gap-4 md:grid-cols-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Opening Balance (SGD)</span>
            <input
              name="openingBalance"
              type="number"
              step="0.01"
              defaultValue={assumptions.openingBalance}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Horizon (days)</span>
            <input
              name="horizonDays"
              type="number"
              min={7}
              max={365}
              defaultValue={assumptions.horizonDays}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Collection delay (days)</span>
            <input
              name="collectionDelayDays"
              type="number"
              min={0}
              max={60}
              defaultValue={assumptions.collectionDelayDays}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Supplier payment delay (days)</span>
            <input
              name="supplierPaymentDelayDays"
              type="number"
              min={0}
              max={90}
              defaultValue={assumptions.supplierPaymentDelayDays}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
            />
          </label>
          <div className="md:col-span-4 flex justify-end">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Update Forecast
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <SummaryCard title="Opening Balance" value={formatCurrency(forecast.openingBalance)} />
        <SummaryCard title="Expected Inflows" value={formatCurrency(forecast.expectedInflows)} />
        <SummaryCard title="Expected Outflows" value={formatCurrency(forecast.expectedOutflows)} />
        <SummaryCard title="Projected Closing" value={formatCurrency(forecast.projectedClosingBalance)} />
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Risk & Exceptions</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Bank-grade warning signals based on forecast imbalance and overdue exposure.
            </p>
          </div>
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${riskBadgeClass(forecast.riskLevel)}`}>
            {forecast.riskLevel}
          </span>
        </div>

        <div className="mt-5 grid gap-2 text-sm">
          <Row label="Net Cashflow" value={formatCurrency(forecast.netCashflow)} strong />
          <Row label="Overdue Receivables" value={formatCurrency(forecast.overdueReceivables)} />
          <Row label="Overdue Payables" value={formatCurrency(forecast.overduePayables)} />
        </div>

        {forecast.projectedClosingBalance < 0 ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Cash shortfall warning</p>
            <p className="mt-1">
              Projected closing balance is negative within the forecast horizon. Review collections and supplier commitments.
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Forecast Windows</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {forecast.windows.map((w) => (
            <div key={w.days} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Next {w.days} days
              </p>
              <p className="mt-3 text-sm text-neutral-700">Inflows</p>
              <p className="text-lg font-semibold text-neutral-950">{formatCurrency(w.inflows)}</p>
              <p className="mt-2 text-sm text-neutral-700">Outflows</p>
              <p className="text-lg font-semibold text-neutral-950">{formatCurrency(w.outflows)}</p>
              <p className="mt-2 text-sm text-neutral-700">Net</p>
              <p className="text-lg font-semibold text-neutral-950">{formatCurrency(w.net)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Inflow Lines</h2>
          <p className="mt-1 text-sm text-neutral-600">Expected collections and future billing stages.</p>
          <LinesTable lines={forecast.lines.filter((l) => l.direction === "INFLOW")} />
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Outflow Lines</h2>
          <p className="mt-1 text-sm text-neutral-600">Supplier bills, PO commitments, and subcontract claims.</p>
          <LinesTable lines={forecast.lines.filter((l) => l.direction === "OUTFLOW")} />
        </section>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Projects at Risk (Net Negative, 30 days)</h2>
          <RankingTable rows={negative} />
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Top Net Positive (30 days)</h2>
          <RankingTable rows={mostPositive} />
        </section>
      </section>
    </main>
  );
}

function SummaryCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
    </div>
  );
}

function LinesTable(props: {
  lines: Array<{
    projectId: string | null;
    projectLabel: string | null;
    label: string;
    expectedDate: Date;
    amount: number;
    status: string;
    sourceType: string;
  }>;
}) {
  const rows = props.lines.slice(0, 60);
  return rows.length === 0 ? (
    <p className="mt-4 text-sm text-neutral-600">No lines.</p>
  ) : (
    <div className="mt-5 overflow-hidden rounded-xl border border-neutral-200">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-100 text-neutral-800">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Expected</th>
            <th className="px-4 py-3 text-left font-semibold">Project</th>
            <th className="px-4 py-3 text-left font-semibold">Label</th>
            <th className="px-4 py-3 text-left font-semibold">Type</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, idx) => (
            <tr key={`${l.sourceType}:${l.label}:${idx}`} className="border-t border-neutral-200 bg-white">
              <td className="px-4 py-3 text-neutral-700">
                {new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(l.expectedDate)}
              </td>
              <td className="px-4 py-3 text-neutral-700">
                {l.projectId ? (
                  <Link href={`/projects/${l.projectId}/cashflow`} className="font-medium text-neutral-900 hover:underline">
                    {l.projectLabel ?? "Project"}
                  </Link>
                ) : (
                  "-"
                )}
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

function RankingTable(props: {
  rows: Array<{ projectId: string; label: string; inflows30: number; outflows30: number; net30: number }>;
}) {
  if (props.rows.length === 0) return <p className="mt-4 text-sm text-neutral-600">No projects.</p>;
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-neutral-200">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-100 text-neutral-800">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Project</th>
            <th className="px-4 py-3 text-right font-semibold">Inflows (30d)</th>
            <th className="px-4 py-3 text-right font-semibold">Outflows (30d)</th>
            <th className="px-4 py-3 text-right font-semibold">Net (30d)</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={r.projectId} className="border-t border-neutral-200 bg-white">
              <td className="px-4 py-3 text-neutral-900">
                <Link href={`/projects/${r.projectId}/cashflow`} className="font-medium hover:underline">
                  {r.label}
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(r.inflows30)}</td>
              <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(r.outflows30)}</td>
              <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(r.net30)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

