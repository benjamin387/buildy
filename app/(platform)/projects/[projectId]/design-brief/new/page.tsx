import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignStyle, Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createDesignBriefAction } from "@/app/(platform)/projects/[projectId]/design-brief/actions";

export default async function NewDesignBriefPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) notFound();

  const lead = await prisma.lead.findFirst({
    where: { convertedProjectId: projectId },
    orderBy: [{ convertedAt: "desc" }, { createdAt: "desc" }],
  });

  const defaultClientNeeds =
    [
      lead?.requirementSummary ? `Requirements: ${lead.requirementSummary}` : null,
      lead?.preferredDesignStyle ? `Preferred style: ${lead.preferredDesignStyle}` : null,
      lead?.notes ? `Lead notes: ${lead.notes}` : null,
    ]
      .filter((x): x is string => Boolean(x))
      .join("\n") ||
    `Client: ${project.client.name}\nSite: ${project.siteAddress || project.addressLine1}\n\nKey needs:\n-`;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/design-brief`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Design Workflow
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            New Design Brief
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Start structured collaboration and room-by-room design development before quotation finalization.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <form action={createDesignBriefAction} className="grid gap-5 lg:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Title</span>
            <input
              name="title"
              required
              defaultValue={`${project.name} Design Brief`}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Property Type</span>
            <select
              name="propertyType"
              defaultValue={project.propertyType}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="HDB">HDB</option>
              <option value="CONDO">CONDO</option>
              <option value="LANDED">LANDED</option>
              <option value="COMMERCIAL">COMMERCIAL</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Design Style (optional)</span>
            <select
              name="designStyle"
              defaultValue={lead?.preferredDesignStyle ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">(None)</option>
              <option value={DesignStyle.MODERN}>MODERN</option>
              <option value={DesignStyle.MINIMALIST}>MINIMALIST</option>
              <option value={DesignStyle.INDUSTRIAL}>INDUSTRIAL</option>
              <option value={DesignStyle.SCANDINAVIAN}>SCANDINAVIAN</option>
              <option value={DesignStyle.CONTEMPORARY}>CONTEMPORARY</option>
              <option value={DesignStyle.OTHERS}>OTHERS</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Client Needs</span>
            <textarea
              name="clientNeeds"
              rows={10}
              required
              defaultValue={defaultClientNeeds}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Capture needs, scope expectations, lifestyle constraints, must-haves, and preferences."
            />
          </label>

          <div className="flex justify-end lg:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Create Design Brief
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

