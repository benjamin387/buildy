import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { listLeadSiteVisits } from "@/lib/site-visits/service";
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

export default async function LeadSiteVisitsPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  await requirePermission({ permission: Permission.PROJECT_READ });

  const { leadId } = await params;

  const [lead, visits] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, leadNumber: true, customerName: true, projectAddress: true, convertedProjectId: true },
    }),
    listLeadSiteVisits(leadId),
  ]);

  if (!lead) notFound();

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/leads/${leadId}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {lead.leadNumber}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Lead Site Visits
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            {lead.customerName}
          </h1>
          <p className="mt-2 text-sm text-neutral-600">{lead.projectAddress}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/leads/${leadId}/site-visits/new`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Schedule Site Visit
          </Link>
          {lead.convertedProjectId ? (
            <Link
              href={`/projects/${lead.convertedProjectId}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Open Project
            </Link>
          ) : null}
        </div>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        {visits.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No site visits yet"
              description="Schedule a site visit to capture measurements, photos, requirements, and timeline expectations."
              ctaLabel="Schedule Site Visit"
              ctaHref={`/leads/${leadId}/site-visits/new`}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Schedule</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Assigned</th>
                  <th className="px-4 py-4 text-left font-semibold">Address</th>
                  <th className="px-4 py-4 text-left font-semibold">Project</th>
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
                    <td className="px-4 py-4 text-neutral-700">
                      {visit.assignedSalesName || visit.assignedDesignerName ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-neutral-900">
                            {visit.assignedSalesName || visit.assignedDesignerName}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {visit.assignedSalesEmail || visit.assignedDesignerEmail || "-"}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{visit.addressSnapshot}</td>
                    <td className="px-4 py-4 text-neutral-700">
                      {visit.project ? (
                        <Link
                          href={`/projects/${visit.project.id}`}
                          className="text-sm font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-500"
                        >
                          {visit.project.projectCode || visit.project.name}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/leads/${leadId}/site-visits/${visit.id}`}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                      >
                        Open
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

