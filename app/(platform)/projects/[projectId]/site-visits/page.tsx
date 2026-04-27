import Link from "next/link";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { listProjectSiteVisits } from "@/lib/site-visits/service";
import { EmptyState } from "@/app/(platform)/projects/components/empty-state";
import { SiteVisitStatusBadge } from "@/app/(platform)/leads/[leadId]/site-visits/components/site-visit-status-badge";

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

export default async function ProjectSiteVisitsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const visits = await listProjectSiteVisits(projectId);

  const scheduled = visits.filter((v) => v.status === "SCHEDULED").length;
  const completed = visits.filter((v) => v.status === "COMPLETED").length;
  const cancelled = visits.filter((v) => v.status === "CANCELLED").length;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Site Visits
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Requirement Capture
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Measurements, photos, requirements, budget, and timeline expectations linked to this project.
          </p>
        </div>
        <Link
          href="/leads"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Schedule via Lead
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total" value={`${visits.length}`} />
        <SummaryCard title="Scheduled" value={`${scheduled}`} />
        <SummaryCard title="Completed" value={`${completed}`} />
        <SummaryCard title="Cancelled" value={`${cancelled}`} />
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {visits.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No site visits linked to this project"
              description="Site visits are typically created from a Lead. Convert the lead to a project, then create quotation drafts from completed site visits."
              ctaLabel="Go to Leads"
              ctaHref="/leads"
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Schedule</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Lead</th>
                  <th className="px-4 py-4 text-left font-semibold">Address</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 text-neutral-900">
                      <div className="flex flex-col">
                        <span className="font-medium">{formatDateTime(visit.scheduledAt)}</span>
                        <span className="text-xs text-neutral-500">
                          {visit.completedAt ? `Completed ${formatDateTime(visit.completedAt)}` : "Not completed"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <SiteVisitStatusBadge status={visit.status} />
                    </td>
                    <td className="px-4 py-4 text-neutral-900">
                      {visit.lead ? (
                        <div className="flex flex-col">
                          <span className="font-medium">{visit.lead.leadNumber}</span>
                          <span className="text-xs text-neutral-500">{visit.lead.customerName}</span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{visit.addressSnapshot}</td>
                    <td className="px-4 py-4">
                      {visit.lead ? (
                        <Link
                          href={`/leads/${visit.lead.id}/site-visits/${visit.id}`}
                          className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                        >
                          Open
                        </Link>
                      ) : (
                        "-"
                      )}
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

function SummaryCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
    </div>
  );
}

