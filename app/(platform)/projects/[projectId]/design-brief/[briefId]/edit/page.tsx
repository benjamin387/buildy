import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignStyle, Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  deleteDesignBriefAction,
  updateDesignBriefAction,
} from "@/app/(platform)/projects/[projectId]/design-brief/actions";

function formatBlocker(count: number, label: string): string | null {
  if (count < 1) return null;
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

export default async function EditDesignBriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; briefId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, briefId } = await params;
  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const brief = await prisma.designBrief.findUnique({
    where: { id: briefId },
    select: {
      id: true,
      projectId: true,
      title: true,
      clientNeeds: true,
      designStyle: true,
      propertyType: true,
      status: true,
      project: {
        select: {
          name: true,
          client: { select: { name: true } },
        },
      },
      _count: {
        select: {
          followUps: true,
          quotations: true,
          upsellRecommendations: true,
        },
      },
    },
  });
  if (!brief || brief.projectId !== projectId) notFound();

  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : "";
  const notice = typeof sp.notice === "string" ? sp.notice : "";

  const deleteBlockers = [
    formatBlocker(brief._count.quotations, "linked quotation"),
    formatBlocker(brief._count.followUps, "client follow-up"),
    formatBlocker(brief._count.upsellRecommendations, "upsell recommendation"),
  ].filter((value): value is string => Boolean(value));
  const hasDeleteBlockers = deleteBlockers.length > 0;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/design-brief/${briefId}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Design Workflow
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            Edit Design Brief
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            {brief.project?.name ?? "Project"} · {brief.project?.client?.name ?? "-"} · Status: {brief.status}
          </p>
        </div>
      </div>

      {error ? (
        <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">Unable to save changes</p>
          <p className="mt-1">{error}</p>
        </section>
      ) : null}

      {notice ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </section>
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <form action={updateDesignBriefAction} className="grid gap-5 lg:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="briefId" value={briefId} />

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Title</span>
            <input
              name="title"
              required
              defaultValue={brief.title}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Property Type</span>
            <select
              name="propertyType"
              defaultValue={brief.propertyType}
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
              defaultValue={brief.designStyle ?? ""}
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
              defaultValue={brief.clientNeeds}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Capture needs, scope expectations, lifestyle constraints, must-haves, and preferences."
            />
          </label>

          <div className="flex justify-end lg:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Save Changes
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-900">Delete Design Brief</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-700">
          Deleting this brief also removes its tasks, areas, layouts, renders, presentation, and other brief-only records.
        </p>

        {hasDeleteBlockers ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Delete is blocked while this brief still has {deleteBlockers.join(", ")}.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            No linked quotations, follow-ups, or upsell recommendations are attached to this brief.
          </div>
        )}

        <form action={deleteDesignBriefAction} className="mt-5">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="briefId" value={briefId} />
          <button
            disabled={hasDeleteBlockers}
            className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition ${
              hasDeleteBlockers ? "cursor-not-allowed bg-red-300" : "bg-red-600 hover:bg-red-500"
            }`}
          >
            Delete Design Brief
          </button>
        </form>
      </section>
    </main>
  );
}
