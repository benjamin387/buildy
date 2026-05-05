import Link from "next/link";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function MetricCard(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
      {props.hint ? <p className="mt-2 text-sm text-neutral-600">{props.hint}</p> : null}
    </div>
  );
}

export default async function SalesDashboardPage() {
  await requirePermission({ permission: Permission.PROJECT_READ });

  const [leadCounts, briefCounts, quotationCounts, contractCounts, upsellCounts] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.designBrief.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.quotation.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.contract.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.upsellRecommendation.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  function countFrom<T extends { status: string; _count: { _all: number } }>(rows: T[], key: string): number {
    return rows.find((r) => r.status === key)?._count._all ?? 0;
  }

  const convertedLeads = countFrom(leadCounts as any, "CONVERTED");
  const designBriefsReady = countFrom(briefCounts as any, "READY_FOR_QUOTATION");
  const salesPackagesReady = countFrom(briefCounts as any, "SALES_PACKAGE_READY");
  const sentPackages = countFrom(briefCounts as any, "SENT_TO_CLIENT");

  const approvedQuotations = countFrom(quotationCounts as any, "APPROVED");
  const signedContracts = countFrom(contractCounts as any, "SIGNED") + countFrom(contractCounts as any, "FINAL");

  const acceptedUpsells = countFrom(upsellCounts as any, "ACCEPTED");
  const totalUpsells =
    upsellCounts.reduce((sum, r) => sum + r._count._all, 0) || 0;

  const leadsWithQuotes = await prisma.lead.count({
    where: {
      status: "CONVERTED",
      convertedProjectId: { not: null },
      convertedProject: { quotations: { some: {} } },
    },
  });

  const quoteToContract = await prisma.quotation.count({
    where: {
      status: "APPROVED",
      contracts: { some: { status: { in: ["SIGNED", "FINAL"] } } },
    },
  });

  const leadToQuoteRate = convertedLeads > 0 ? (leadsWithQuotes / convertedLeads) * 100 : 0;
  const quoteToContractRate = approvedQuotations > 0 ? (quoteToContract / approvedQuotations) * 100 : 0;
  const upsellAcceptanceRate = totalUpsells > 0 ? (acceptedUpsells / totalUpsells) * 100 : 0;

  const briefsQueue = await prisma.designBrief.findMany({
    where: {
      status: { in: ["READY_FOR_QUOTATION", "SALES_PACKAGE_READY", "SENT_TO_CLIENT"] },
      projectId: { not: null },
    },
    include: { project: { select: { id: true, projectCode: true, name: true } } },
    orderBy: [{ updatedAt: "desc" }],
    take: 30,
  });

  const pipelineSummary = [
    { label: "Design Briefs Ready", value: designBriefsReady, href: "/projects" },
    { label: "Sales Packages Ready", value: salesPackagesReady, href: "/projects" },
    { label: "Sent Packages", value: sentPackages, href: "/projects" },
  ];

  const leadSummary = [
    { label: "New Leads", value: countFrom(leadCounts as any, "NEW") },
    { label: "Contacted", value: countFrom(leadCounts as any, "CONTACTED") },
    { label: "Site Visits", value: countFrom(leadCounts as any, "SITE_VISIT_SCHEDULED") },
    { label: "Quote Pending", value: countFrom(leadCounts as any, "QUOTATION_PENDING") },
    { label: "Converted", value: convertedLeads },
    { label: "Lost", value: countFrom(leadCounts as any, "LOST") },
  ];

  return (
    <main className="space-y-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Sales</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Sales Dashboard
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-700">
            Pipeline visibility from Lead → Design → Quotation → Contract, including upsell and conversion metrics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/leads"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Open Leads
          </Link>
          <Link
            href="/projects"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Open Projects
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Lead → Quotation" value={formatPct(leadToQuoteRate)} hint={`${leadsWithQuotes}/${convertedLeads} converted leads have quotations`} />
        <MetricCard title="Quotation → Contract" value={formatPct(quoteToContractRate)} hint={`${quoteToContract}/${approvedQuotations} approved quotations became contracts`} />
        <MetricCard title="Upsell Acceptance" value={formatPct(upsellAcceptanceRate)} hint={`${acceptedUpsells}/${totalUpsells} upsells accepted`} />
        <MetricCard title="Signed Contracts" value={`${signedContracts}`} hint="SIGNED + FINAL" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {pipelineSummary.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{s.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">{s.value}</p>
            <p className="mt-2 text-sm text-neutral-600">Open projects to take action.</p>
          </Link>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Leads
          </h2>
          <Link href="/leads" className="text-sm font-medium text-neutral-900 hover:underline">
            Open Leads →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {leadSummary.map((s) => (
            <div key={s.label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{s.label}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Briefs In Pipeline
          </h2>
          <p className="text-sm text-neutral-600">
            Latest design briefs that are ready for quotation, sales package, or client sending.
          </p>
        </div>
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Project</th>
                <th className="px-4 py-3 text-left font-semibold">Brief</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {briefsQueue.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-neutral-600" colSpan={4}>
                    No briefs in the selected pipeline stages.
                  </td>
                </tr>
              ) : (
                briefsQueue.map((b) => (
                  <tr key={b.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 text-neutral-900">
                      {b.project ? (
                        <Link
                          href={`/projects/${b.project.id}`}
                          className="font-medium text-neutral-950 hover:underline"
                        >
                          {b.project.projectCode ? `${b.project.projectCode} · ` : ""}
                          {b.project.name}
                        </Link>
                      ) : (
                        <span className="text-neutral-700">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-900">{b.title}</td>
                    <td className="px-4 py-3 text-neutral-700">{b.status}</td>
                    <td className="px-4 py-3">
                      {b.project ? (
                        <Link
                          href={`/projects/${b.project.id}/design-brief/${b.id}`}
                          className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                        >
                          Open Brief
                        </Link>
                      ) : (
                        <span className="text-neutral-700">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Commercial Snapshot
          </h2>
          <p className="text-sm text-neutral-600">
            Quick totals for pipeline hygiene (volume, not project-level profitability).
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Approved Quotations" value={`${approvedQuotations}`} />
          <MetricCard title="Contracts Signed" value={`${signedContracts}`} />
          <MetricCard title="Upsells Accepted" value={`${acceptedUpsells}`} />
          <MetricCard title="Upsells Total" value={`${totalUpsells}`} />
        </div>
      </section>
    </main>
  );
}
