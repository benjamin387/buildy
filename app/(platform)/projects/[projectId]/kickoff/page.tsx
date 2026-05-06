import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission, ProjectStatus } from "@prisma/client";
import {
  initializeProjectKickoff,
  markProjectReadyForExecution,
  toggleKickoffChecklistItem,
} from "@/app/(platform)/projects/[projectId]/kickoff/actions";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { prisma } from "@/lib/prisma";
import {
  calculateKickoffProgress,
  PROJECT_KICKOFF_CHECKLIST,
  PROJECT_KICKOFF_ITEM_COUNT,
} from "@/lib/projects/kickoff";
import { getProjectPermissions, requireUserId } from "@/lib/rbac";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function readinessBadge(
  isReady: boolean,
  status: ProjectStatus,
): { label: string; tone: "success" | "warning" | "info" } {
  if (isReady && status === ProjectStatus.IN_PROGRESS) {
    return { label: "Execution Live", tone: "success" };
  }
  if (isReady) {
    return { label: "Ready for Execution", tone: "success" };
  }
  if (status === ProjectStatus.CONTRACTED) {
    return { label: "Kickoff In Progress", tone: "warning" };
  }
  return { label: "Kickoff Pending", tone: "info" };
}

export default async function ProjectKickoffPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const userId = await requireUserId();
  const permissions = await getProjectPermissions({ userId, projectId });
  const canWrite = permissions.has(Permission.PROJECT_WRITE);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      targetCompletionDate: true,
      kickoffChecklistItems: {
        select: {
          id: true,
          itemKey: true,
          label: true,
          isCompleted: true,
          completedAt: true,
          completedBy: true,
        },
      },
    },
  });

  if (!project) notFound();

  const items = PROJECT_KICKOFF_CHECKLIST.map((template) => {
    const existing = project.kickoffChecklistItems.find(
      (item) => item.itemKey === template.itemKey,
    );
    return {
      id: existing?.id ?? template.itemKey,
      itemKey: template.itemKey,
      label: existing?.label ?? template.label,
      isCompleted: existing?.isCompleted ?? false,
      completedAt: existing?.completedAt ?? null,
      completedBy: existing?.completedBy ?? null,
    };
  });

  const initialized = project.kickoffChecklistItems.length > 0;
  const completedCount = items.filter((item) => item.isCompleted).length;
  const pendingItems = items.filter((item) => !item.isCompleted);
  const progress = initialized
    ? calculateKickoffProgress(completedCount, PROJECT_KICKOFF_ITEM_COUNT)
    : 0;
  const isReady = initialized && pendingItems.length === 0;
  const readiness = readinessBadge(isReady, project.status);
  const canMarkReady =
    canWrite &&
    initialized &&
    isReady &&
    project.status !== ProjectStatus.IN_PROGRESS &&
    project.status !== ProjectStatus.COMPLETED &&
    project.status !== ProjectStatus.CANCELLED;

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Project Kickoff"
        title="Execution Control"
        subtitle={`Convert ${project.name} from an approved commercial deal into an execution-ready project with clear pre-start controls.`}
        backHref={`/projects/${projectId}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
            {initialized ? (
              <Link
                href={`/projects/${projectId}/execution`}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
              >
                Open Execution
              </Link>
            ) : null}
            {!initialized && canWrite ? (
              <form action={initializeProjectKickoff}>
                <input type="hidden" name="projectId" value={projectId} />
                <PendingSubmitButton
                  pendingText="Starting..."
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Initialize Kickoff
                </PendingSubmitButton>
              </form>
            ) : null}
            {canMarkReady ? (
              <form action={markProjectReadyForExecution}>
                <input type="hidden" name="projectId" value={projectId} />
                <PendingSubmitButton
                  pendingText="Activating..."
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Mark Ready for Execution
                </PendingSubmitButton>
              </form>
            ) : null}
          </div>
        }
      />

      {!initialized ? (
        <SectionCard
          title="Kickoff not initialized"
          description="Create the kickoff checklist once the proposal has been approved or signed. Existing commercial records will be synchronized into the checklist where the state is unambiguous."
        >
          <div className="rounded-[24px] border border-slate-200 bg-stone-50 p-5">
            <p className="text-sm leading-7 text-neutral-700">
              This project does not have kickoff controls yet. Use the approved proposal
              entry point or initialize the checklist here to start tracking contract,
              billing, supplier, timeline, and handover readiness.
            </p>
            {canWrite ? (
              <form action={initializeProjectKickoff} className="mt-5">
                <input type="hidden" name="projectId" value={projectId} />
                <PendingSubmitButton
                  pendingText="Starting..."
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Start Project Kickoff
                </PendingSubmitButton>
              </form>
            ) : null}
          </div>
        </SectionCard>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.92),_rgba(244,244,245,0.94),_rgba(231,229,228,0.9))] p-6 shadow-[0_1px_0_rgba(16,24,40,0.04),0_18px_40px_rgba(16,24,40,0.08)] sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                    Kickoff Progress
                  </p>
                  <p className="mt-3 text-5xl font-semibold tracking-tight text-neutral-950">
                    {progress}%
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    {completedCount} of {PROJECT_KICKOFF_ITEM_COUNT} controls cleared
                    before execution starts.
                  </p>
                </div>
                <StatusPill tone={readiness.tone}>{readiness.label}</StatusPill>
              </div>
              <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/70 ring-1 ring-slate-200/80">
                <div
                  className="h-full rounded-full bg-neutral-950 transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Completed" value={`${completedCount}`} tone="success" />
                <MetricCard label="Pending" value={`${pendingItems.length}`} tone="warning" />
                <MetricCard
                  label="Handover Target"
                  value={
                    project.targetCompletionDate
                      ? formatDateTime(project.targetCompletionDate)
                      : "Not set"
                  }
                  tone="info"
                />
              </div>
            </div>

            <div className="grid gap-4">
              <MetricPanel
                label="Current Project Status"
                value={project.status.replaceAll("_", " ")}
              />
              <MetricPanel
                label="Execution Start"
                value={
                  project.startDate ? formatDateTime(project.startDate) : "Not started"
                }
              />
              <MetricPanel
                label="Readiness Gate"
                value={isReady ? "All controls cleared" : "Outstanding actions remain"}
              />
            </div>
          </section>

          {pendingItems.length > 0 ? (
            <section className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-5 shadow-sm sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900">
                    Missing Item Warnings
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-900/90">
                    Execution should not be activated until the remaining kickoff items are
                    resolved.
                  </p>
                </div>
                <ul className="grid gap-2 text-sm font-medium text-amber-950 sm:grid-cols-2">
                  {pendingItems.map((item) => (
                    <li
                      key={item.itemKey}
                      className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2"
                    >
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-5 shadow-sm sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-900">
                Readiness Confirmed
              </p>
              <p className="mt-2 text-sm leading-6 text-emerald-900/90">
                Every kickoff control is complete. You can now move the project into active
                execution.
              </p>
            </section>
          )}

          <SectionCard
            title="Kickoff Checklist"
            description="Treat these as hard pre-start controls. Each item is tracked individually and contributes to the execution readiness gate."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((item, index) => (
                <article
                  key={item.itemKey}
                  className={cx(
                    "rounded-[24px] border p-5 shadow-sm transition",
                    item.isCompleted
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={item.isCompleted ? "success" : "warning"}>
                          {item.isCompleted ? "Complete" : "Pending"}
                        </StatusPill>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                          Item {index + 1}
                        </span>
                      </div>
                      <h2 className="mt-3 text-base font-semibold tracking-tight text-neutral-950">
                        {item.label}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-neutral-600">
                        {item.isCompleted
                          ? `Completed ${formatDateTime(item.completedAt)}${item.completedBy ? ` by ${item.completedBy}` : ""}.`
                          : "This control must be cleared before the project is execution-ready."}
                      </p>
                    </div>

                    {canWrite ? (
                      <form action={toggleKickoffChecklistItem} className="shrink-0">
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="itemKey" value={item.itemKey} />
                        <PendingSubmitButton
                          pendingText="Saving..."
                          className={cx(
                            "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                            item.isCompleted
                              ? "border border-slate-200 bg-white text-neutral-900 hover:bg-stone-50"
                              : "bg-neutral-950 text-white hover:bg-neutral-800",
                          )}
                        >
                          {item.isCompleted ? "Mark Pending" : "Mark Complete"}
                        </PendingSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </main>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  tone: "success" | "warning" | "info";
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-4 shadow-sm backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.label}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-lg font-semibold text-neutral-950">{props.value}</p>
        <StatusPill tone={props.tone}>{props.label}</StatusPill>
      </div>
    </div>
  );
}

function MetricPanel(props: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.label}
      </p>
      <p className="mt-3 text-lg font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}
