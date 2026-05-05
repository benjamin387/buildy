import Link from "next/link";
import { redirect } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { listProjectDesignBriefs } from "@/lib/design-workflow/service";
import { EmptyState } from "@/app/(platform)/projects/components/empty-state";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ProjectDesignBriefOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const briefs = await listProjectDesignBriefs(projectId);
  const latest = briefs[0] ?? null;

  const sp = await searchParams;
  const view = typeof sp.view === "string" ? sp.view : "";
  const notice = typeof sp.notice === "string" ? sp.notice : "";
  const error = typeof sp.error === "string" ? sp.error : "";
  if (view === "areas" && latest) {
    redirect(`/projects/${projectId}/design-brief/${latest.id}/areas`);
  }
  if (view === "presentation" && latest) {
    redirect(`/projects/${projectId}/design-brief/${latest.id}/presentation`);
  }
  if (view === "budget-optimizer" && latest) {
    redirect(`/projects/${projectId}/design-brief/${latest.id}/budget-optimizer`);
  }
  if (view === "upsell-engine" && latest) {
    redirect(`/projects/${projectId}/design-brief/${latest.id}/upsell-engine`);
  }

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Design Workflow
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Design Briefs
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Coordinate drafter, 3D visualiser, FF&amp;E designer, QS, and admin work before quotation finalization.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${projectId}/design-brief/new`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            New Design Brief
          </Link>
          {latest ? (
            <Link
              href={`/projects/${projectId}/design-brief/${latest.id}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Open Latest
            </Link>
          ) : null}
          {latest ? (
            <Link
              href={`/projects/${projectId}/design-brief/${latest.id}/edit`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Edit Latest
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Error:</span> {error}
        </section>
      ) : null}

      {notice ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </section>
      ) : null}

      {latest ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <QuickCard title="Latest Status" value={latest.status} />
          <QuickCard title="Tasks" value={`${latest.tasks.length}`} />
          <QuickCard title="Areas" value={`${latest.areas.length}`} />
        </section>
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        {briefs.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No design briefs yet"
              description="Create a design brief to start structured collaboration and generate QS BOQ drafts before pushing to quotation."
              ctaLabel="Create Design Brief"
              ctaHref={`/projects/${projectId}/design-brief/new`}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Brief</th>
                  <th className="px-4 py-4 text-left font-semibold">Property</th>
                  <th className="px-4 py-4 text-left font-semibold">Style</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Created</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {briefs.map((b) => (
                  <tr key={b.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 text-neutral-900">
                      <div className="flex flex-col">
                        <span className="font-semibold">{b.title}</span>
                        <span className="text-xs text-neutral-500">{b.clientNeeds.slice(0, 80)}{b.clientNeeds.length > 80 ? "…" : ""}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{b.propertyType}</td>
                    <td className="px-4 py-4 text-neutral-700">{b.designStyle ?? "-"}</td>
                    <td className="px-4 py-4 text-neutral-700">{b.status}</td>
                    <td className="px-4 py-4 text-neutral-700">{formatDate(b.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/projects/${projectId}/design-brief/${b.id}`}
                          className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                        >
                          Open
                        </Link>
                        <Link
                          href={`/projects/${projectId}/design-brief/${b.id}/edit`}
                          className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                        >
                          Edit
                        </Link>
                      </div>
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

function QuickCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
    </div>
  );
}
