import Link from "next/link";
import { Permission } from "@prisma/client";
import { getGlobalPermissions, requireUserId } from "@/lib/rbac";
import { countProjectStatusesForUser, listProjectsForUser } from "@/lib/projects/service";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ProjectStatusBadge } from "@/app/(platform)/projects/components/project-status-badge";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

const fieldClass = "mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-neutral-400 transition focus:ring-2";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ProjectsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  const globalPermissions = await getGlobalPermissions(userId);
  const canReadAll = globalPermissions.has(Permission.PROJECT_READ);

  const params = await searchParams;
  const qParam = params.q;
  const q = typeof qParam === "string" ? qParam : "";

  const { page, pageSize, skip, take } = parsePagination(params);

  const [projectsPage, counts] = await Promise.all([
    listProjectsForUser({ userId, canReadAll, search: q, skip, take }),
    countProjectStatusesForUser({ userId, canReadAll, search: q }),
  ]);
  const projects = projectsPage.items;
  const total = projectsPage.total;

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  const hrefForPage = (n: number) => buildPageHref("/projects", baseParams, n, pageSize);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Interior Design / Renovation"
        title="Projects"
        subtitle="Enterprise project register with commercial snapshot, milestones, tasks, and progress tracking."
        actions={<Link href="/projects/new"><ActionButton>New Project</ActionButton></Link>}
      />

      <SectionCard title="Search" description="Search by code, project, client, email, or address.">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Query
            </label>
            <input
              name="q"
              defaultValue={q}
              placeholder="e.g. BDY-001, Tan, Tanjong Pagar, @gmail.com"
              className={fieldClass}
            />
          </div>
          <div className="flex items-center gap-2 pt-6 sm:pt-0">
            <ActionButton type="submit" variant="primary">Search</ActionButton>
            <Link href="/projects"><ActionButton type="button" variant="secondary">Reset</ActionButton></Link>
          </div>
        </form>
      </SectionCard>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total" value={`${total}`} tone="info" />
        <SummaryCard title="Lead" value={`${counts.LEAD}`} />
        <SummaryCard title="In Progress" value={`${counts.IN_PROGRESS}`} tone="warning" />
        <SummaryCard title="Completed" value={`${counts.COMPLETED}`} tone="success" />
      </section>

      <SectionCard title="Project Register" description="Open a project to access quotations, contracts, billing, suppliers, and profitability.">
        <div className="space-y-4">
        {projects.length === 0 ? (
          <EmptyState
            title="No projects found"
            description={
              q
                ? "Try adjusting your search terms."
                : "Create your first project to start milestones, tasks, and progress tracking."
            }
            ctaLabel="Create Project"
            ctaHref="/projects/new"
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[1040px] overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-50 text-neutral-700">
                    <tr>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Code</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Project</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Client</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Status</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Start</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Target</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Contract</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Profit</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr key={project.id} className="border-t border-slate-200">
                        <td className="px-4 py-4 font-semibold text-neutral-900 tabular-nums">{project.projectCode ?? "-"}</td>
                        <td className="px-4 py-4 text-neutral-900">
                          <div className="flex flex-col">
                            <span className="font-semibold">{project.name}</span>
                            <span className="text-xs text-neutral-500">{project.projectType}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-neutral-900">
                          <div className="flex flex-col">
                            <span className="font-semibold">{project.clientName}</span>
                            <span className="text-xs text-neutral-500">{project.clientCompany ?? "-"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <ProjectStatusBadge status={project.status} />
                        </td>
                        <td className="px-4 py-4 text-neutral-700 tabular-nums">{formatDate(project.startDate)}</td>
                        <td className="px-4 py-4 text-neutral-700 tabular-nums">{formatDate(project.targetCompletionDate)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">
                          {formatCurrency(
                            Number(
                              project.revisedContractValue && Number(project.revisedContractValue) > 0
                                ? project.revisedContractValue
                                : project.contractValue,
                            ),
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">
                          {formatCurrency(Number(project.projectedProfit))}
                        </td>
                        <td className="px-4 py-4">
                          <Link href={`/projects/${project.id}`}>
                            <ActionButton variant="secondary" size="sm">
                              Open
                            </ActionButton>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </SectionCard>
    </main>
  );
}

function SummaryCard(props: { title: string; value: string; tone?: Parameters<typeof StatusPill>[0]["tone"] }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">{props.title}</p>
        <StatusPill tone={props.tone ?? "neutral"}>{props.value}</StatusPill>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 tabular-nums">{props.value}</p>
    </div>
  );
}

function ProjectCard(props: { project: Awaited<ReturnType<typeof listProjectsForUser>>["items"][number] }) {
  const project = props.project;
  const contractValue = Number(
    project.revisedContractValue && Number(project.revisedContractValue) > 0 ? project.revisedContractValue : project.contractValue,
  );

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:bg-stone-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-neutral-950">{project.name}</p>
          <p className="mt-1 text-xs text-neutral-600">
            {project.projectCode ?? "-"} · {project.clientName}
          </p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-slate-200 bg-stone-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Contract</p>
          <p className="mt-1 font-semibold text-neutral-950 tabular-nums">{formatCurrency(contractValue)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-stone-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Profit</p>
          <p className="mt-1 font-semibold text-neutral-950 tabular-nums">{formatCurrency(Number(project.projectedProfit))}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-stone-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Start</p>
          <p className="mt-1 font-semibold text-neutral-950 tabular-nums">{formatDate(project.startDate)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-stone-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Target</p>
          <p className="mt-1 font-semibold text-neutral-950 tabular-nums">{formatDate(project.targetCompletionDate)}</p>
        </div>
      </div>
    </Link>
  );
}
