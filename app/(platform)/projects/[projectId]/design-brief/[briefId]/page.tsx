import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DesignBriefStatus, DesignRole, DesignTaskStatus, Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getDesignBriefById } from "@/lib/design-workflow/service";
import { addDesignTaskAction, generateSalesPackageAction, updateDesignBriefStatusAction, updateDesignTaskAction } from "@/app/(platform)/projects/[projectId]/design-brief/actions";
import { prisma } from "@/lib/prisma";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { generateUpsellRecommendationsAction } from "@/app/(platform)/projects/[projectId]/upsell/actions";

function allowedBriefStatuses(current: DesignBriefStatus): DesignBriefStatus[] {
  const allowed: Record<DesignBriefStatus, DesignBriefStatus[]> = {
    DRAFT: ["DRAFT", "DESIGN_IN_PROGRESS", "REJECTED"],
    DESIGN_IN_PROGRESS: ["DESIGN_IN_PROGRESS", "QS_IN_PROGRESS", "READY_FOR_QUOTATION", "REJECTED"],
    QS_IN_PROGRESS: ["QS_IN_PROGRESS", "READY_FOR_QUOTATION", "REJECTED"],
    READY_FOR_QUOTATION: ["READY_FOR_QUOTATION", "SALES_PACKAGE_READY", "REJECTED"],
    SALES_PACKAGE_READY: ["SALES_PACKAGE_READY", "SENT_TO_CLIENT", "APPROVED", "REJECTED"],
    PRESENTATION_READY: ["PRESENTATION_READY", "SALES_PACKAGE_READY", "SENT_TO_CLIENT", "REJECTED"],
    SENT_TO_CLIENT: ["SENT_TO_CLIENT", "APPROVED", "REJECTED"],
    APPROVED: ["APPROVED"],
    REJECTED: ["REJECTED", "DESIGN_IN_PROGRESS"],
  };
  return allowed[current] ?? [current];
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function Card(props: { title: string; children: ReactNode; description?: string }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-neutral-950">{props.title}</h2>
        {props.description ? <p className="text-sm text-neutral-600">{props.description}</p> : null}
      </div>
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

function RoleBadge(props: { role: DesignRole }) {
  const styles: Record<DesignRole, string> = {
    DRAFTER: "border-indigo-200 bg-indigo-50 text-indigo-800",
    THREE_D_VISUALISER: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    FFE_DESIGNER: "border-amber-200 bg-amber-50 text-amber-800",
    QUANTITY_SURVEYOR: "border-emerald-200 bg-emerald-50 text-emerald-800",
    ADMIN: "border-neutral-200 bg-white text-neutral-700",
  };
  return (
    <span className={["inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]", styles[props.role]].join(" ")}>
      {props.role}
    </span>
  );
}

function StatusPill(props: { status: DesignTaskStatus }) {
  const styles: Record<DesignTaskStatus, string> = {
    TODO: "border-neutral-200 bg-white text-neutral-700",
    IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-800",
    REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
    COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800",
    BLOCKED: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <span className={["inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]", styles[props.status]].join(" ")}>
      {props.status}
    </span>
  );
}

export default async function DesignBriefDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; briefId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, briefId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const brief = await getDesignBriefById(briefId);
  if (!brief || brief.projectId !== projectId) notFound();

  const upsells = await prisma.upsellRecommendation.findMany({
    where: { projectId, designBriefId: briefId, status: { not: "REJECTED" } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 6,
  });

  const sp = await searchParams;
  const pipelineError = typeof sp.pipelineError === "string" ? sp.pipelineError : "";
  const salesPackageReady = typeof sp.salesPackageReady === "string" ? sp.salesPackageReady : "";
  const quotationId = typeof sp.quotationId === "string" ? sp.quotationId : "";

  const openTasks = brief.tasks.filter((t) => t.status !== "COMPLETED").length;
  const roleStats = Object.values(DesignRole).map((role) => {
    const total = brief.tasks.filter((t) => t.role === role).length;
    const completed = brief.tasks.filter((t) => t.role === role && t.status === "COMPLETED").length;
    return { role, total, completed, open: total - completed };
  });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/design-brief`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {brief.propertyType}
            </span>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {brief.designStyle ?? "STYLE-TBD"}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Design Brief
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {brief.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Status: <span className="font-semibold">{brief.status}</span> · Open tasks:{" "}
            <span className="font-semibold">{openTasks}</span> · Areas:{" "}
            <span className="font-semibold">{brief.areas.length}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/projects/${projectId}/design-brief/${briefId}/areas`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Areas
          </Link>
          <Link
            href={`/projects/${projectId}/design-brief/${briefId}/presentation`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Presentation
          </Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard title="Created" value={formatDate(brief.createdAt)} />
        <MetricCard title="Status" value={brief.status} />
        <MetricCard title="Client / Project" value={`${brief.project?.client?.name ?? "-"} · ${brief.project?.name ?? "-"}`} />
      </section>

      <Card title="Role Workload" description="Quick view of task load per role (open vs completed).">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {roleStats.map((s) => (
            <div key={s.role} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <RoleBadge role={s.role} />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  {s.open} open
                </span>
              </div>
              <p className="mt-3 text-sm text-neutral-700">
                Completed: <span className="font-semibold text-neutral-950">{s.completed}</span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Total: {s.total}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Brief Notes" description="Core needs and constraints to guide drafter, 3D, FF&E, QS, and admin.">
        <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">{brief.clientNeeds}</p>
      </Card>

      <Card
        title="Sales Package"
        description="Generate a quotation draft and a ready presentation from selected layouts, selected visuals, and QS BOQ drafts."
      >
        <div id="sales-package" className="scroll-mt-24" />

        {pipelineError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Pipeline validation failed</p>
            <p className="mt-2 whitespace-pre-wrap leading-6">{decodeURIComponent(pipelineError)}</p>
          </div>
        ) : null}

        {salesPackageReady ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Sales package ready</p>
            <p className="mt-2 text-emerald-800">
              Quotation draft and presentation have been generated. Review, edit, then send to client.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <form action={generateSalesPackageAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="briefId" value={briefId} />
            <PendingSubmitButton pendingText="Generating sales package...">Generate Sales Package</PendingSubmitButton>
          </form>
          <form action={generateSalesPackageAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="briefId" value={briefId} />
            <input type="hidden" name="regenerate" value="on" />
            <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              Regenerate (Safe)
            </button>
          </form>
          <Link
            href={`/projects/${projectId}/design-brief/${briefId}/presentation`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Open Presentation
          </Link>
          {quotationId ? (
            <Link
              href={`/projects/${projectId}/quotations/${quotationId}/edit`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Open Quotation Draft
            </Link>
          ) : (
            <Link
              href={`/projects/${projectId}/quotations`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Open Quotations
            </Link>
          )}
        </div>

        <p className="mt-4 text-sm text-neutral-600">
          Preconditions: each area must have a selected layout plan, a selected (or completed) 3D visual, and at least one QS BOQ draft item.
        </p>
      </Card>

      <Card title="Upsell Engine" description="Optional upgrades to increase project value before quotation is finalized.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-neutral-700">
              Generated suggestions: <span className="font-semibold text-neutral-950">{upsells.length}</span>
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              Use the Upsell Engine to generate high-impact add-ons (smart home, premium lighting, feature walls, storage optimization) and push accepted items into a draft quotation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${projectId}/design-brief/${briefId}/upsell-engine`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Open Upsell Engine
            </Link>
            <form action={generateUpsellRecommendationsAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="briefId" value={briefId} />
              <PendingSubmitButton pendingText="Generating...">Generate Upsells</PendingSubmitButton>
            </form>
          </div>
        </div>

        {upsells.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-700">No upsells generated yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {upsells.map((u) => (
              <div key={u.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-950">{u.title}</p>
                <p className="mt-1 text-xs text-neutral-500">{u.category} · {u.priority} · {u.status}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{u.pitchText}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Workflow Status" description="Drive stage gates before pushing to quotation.">
        <form action={updateDesignBriefStatusAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="briefId" value={briefId} />
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Design Brief Status</span>
            <select
              name="status"
              defaultValue={brief.status}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              {allowedBriefStatuses(brief.status).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
            Update
          </button>
        </form>
      </Card>

      <Card title="Design Tasks" description="Role-based task tracking. Update status as work progresses.">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Add Task</p>
          <form action={addDesignTaskAction} className="mt-4 grid gap-3 lg:grid-cols-12">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="briefId" value={briefId} />

            <label className="grid gap-2 text-sm lg:col-span-3">
              <span className="font-medium text-neutral-800">Role</span>
              <select
                name="role"
                defaultValue={DesignRole.DRAFTER}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              >
                {Object.values(DesignRole).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm lg:col-span-5">
              <span className="font-medium text-neutral-800">Title</span>
              <input
                name="title"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Draft furniture layout for Living Room"
              />
            </label>

            <label className="grid gap-2 text-sm lg:col-span-4">
              <span className="font-medium text-neutral-800">Assigned To (optional)</span>
              <input
                name="assignedTo"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="name/email"
              />
            </label>

            <label className="grid gap-2 text-sm lg:col-span-8">
              <span className="font-medium text-neutral-800">Description (optional)</span>
              <input
                name="description"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="Acceptance criteria / references"
              />
            </label>

            <label className="grid gap-2 text-sm lg:col-span-2">
              <span className="font-medium text-neutral-800">Due Date</span>
              <input
                name="dueDate"
                type="date"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <div className="flex justify-end lg:col-span-2">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Add
              </button>
            </div>
          </form>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-4 py-4 text-left font-semibold">Role</th>
                <th className="px-4 py-4 text-left font-semibold">Task</th>
                <th className="px-4 py-4 text-left font-semibold">Status</th>
                <th className="px-4 py-4 text-left font-semibold">Assigned</th>
                <th className="px-4 py-4 text-left font-semibold">Due</th>
                <th className="px-4 py-4 text-left font-semibold">Update</th>
              </tr>
            </thead>
            <tbody>
              {brief.tasks.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-neutral-600" colSpan={6}>
                    No tasks yet.
                  </td>
                </tr>
              ) : (
                brief.tasks.map((t) => (
                  <tr key={t.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4">
                      <RoleBadge role={t.role} />
                    </td>
                    <td className="px-4 py-4 text-neutral-900">
                      <div className="flex flex-col">
                        <span className="font-semibold">{t.title}</span>
                        <span className="text-xs text-neutral-500">{t.description ?? "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{t.assignedTo ?? "-"}</td>
                    <td className="px-4 py-4 text-neutral-700">{formatDate(t.dueDate)}</td>
                    <td className="px-4 py-4">
                      <form action={updateDesignTaskAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="briefId" value={briefId} />
                        <input type="hidden" name="taskId" value={t.id} />
                        <select
                          name="status"
                          defaultValue={t.status}
                          className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                        >
                          {Object.values(DesignTaskStatus).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Areas" description="Break down the project into rooms/areas to capture layout, 3D, FF&E, and QS BOQ drafts.">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${projectId}/design-brief/${briefId}/areas`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Manage Areas
          </Link>
          <Link
            href={`/projects/${projectId}/design-brief/${briefId}/presentation`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Presentation Builder
          </Link>
          <Link
            href={`/projects/${projectId}/design-brief/${briefId}/budget-optimizer`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Budget Optimizer
          </Link>
          <Link
            href={`/projects/${projectId}/design-brief/${briefId}/upsell-engine`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Upsell Engine
          </Link>
        </div>
      </Card>
    </main>
  );
}

function MetricCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-base font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}
