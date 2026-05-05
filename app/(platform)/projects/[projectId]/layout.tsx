import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { ProjectStatusBadge } from "@/app/(platform)/projects/components/project-status-badge";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ProjectTabs } from "@/app/(platform)/projects/[projectId]/components/project-tabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      projectCode: true,
      name: true,
      status: true,
      clientName: true,
      siteAddress: true,
      addressLine1: true,
      client: { select: { id: true, name: true } },
    },
  });

  if (!project) notFound();

  return (
    <div className="space-y-6">
      <div className="no-print sticky top-[76px] z-30 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/projects"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                Back
              </Link>
              <ProjectStatusBadge status={project.status} />
              {project.projectCode ? <StatusPill tone="neutral">{project.projectCode}</StatusPill> : null}
            </div>

            <h1 className="mt-4 truncate text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
              {project.name}
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              {(project.clientName || project.client?.name) ?? "-"} · {project.siteAddress || project.addressLine1 || "-"}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <ProjectTabs projectId={projectId} />
        </div>
      </div>

      {children}
    </div>
  );
}
