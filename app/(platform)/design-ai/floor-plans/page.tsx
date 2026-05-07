import { requireUser } from "@/lib/auth/session";
import {
  getMockFloorPlanMetrics,
  listMockFloorPlans,
  type FloorPlanStatus,
} from "@/lib/design-ai/floor-plan-engine";
import { listPersistedFloorPlans } from "@/app/(platform)/design-ai/floor-plans/data";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { LinkButton } from "@/app/(platform)/design-ai/floor-plans/_components/link-button";

export default async function FloorPlansPage() {
  await requireUser();

  const plans = listMockFloorPlans();
  const metrics = getMockFloorPlanMetrics();
  const persistedPlans = await listPersistedFloorPlans();
  const persistedReadyPlans = persistedPlans.filter((plan) => plan.analysis).length;

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title="AI Floor Plans"
        subtitle="Review saved uploads, room zoning, and downstream renovation guidance while the live parser remains in seeded mock mode."
        backHref="/design-ai"
        actions={
          <LinkButton href="/design-ai/floor-plans/new">New Floor Plan</LinkButton>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Saved Uploads"
          value={String(persistedPlans.length)}
          subtitle="Persisted floor plan sessions"
        />
        <MetricCard
          title="Saved Analyses"
          value={String(persistedReadyPlans)}
          subtitle="Uploads with stored analysis output"
        />
        <MetricCard
          title="Mock Plans"
          value={String(metrics.totalPlans)}
          subtitle="Sample records kept for UI validation"
        />
        <MetricCard
          title="3D Prompts"
          value={String(metrics.totalPerspectivePrompts)}
          subtitle="Perspective prompts prepared"
        />
      </section>

      <SectionCard
        title="Saved Uploads"
        description="Uploaded sessions persist the floor plan record plus the latest generated outputs for each saved step."
      >
        {persistedPlans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6">
            <p className="text-sm font-medium text-neutral-900">
              No floor plan uploads have been saved yet.
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Create a new upload to persist a floor plan record and save downstream analysis, layout,
              perspective, cabinet, and workflow outputs.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {persistedPlans.map((snapshot) => {
              const savedStepCount = [
                snapshot.analysis,
                snapshot.furnitureLayout,
                snapshot.designPerspectives,
                snapshot.cabinetDesign,
                snapshot.renovationWorkflow,
              ].filter(Boolean).length;

              return (
                <article
                  key={snapshot.upload.id}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-black/5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                        Persisted Upload
                      </p>
                      <h2 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">
                        {snapshot.plan.projectName}
                      </h2>
                      <p className="mt-1 text-sm text-neutral-600">
                        {snapshot.plan.sourceFileName}
                      </p>
                    </div>
                    <StatusPill tone={statusTone(snapshot.plan.status)}>
                      {formatStatus(snapshot.plan.status)}
                    </StatusPill>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-neutral-700">{snapshot.plan.summary}</p>

                  <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                    <InfoLine label="Saved On" value={formatDate(snapshot.upload.createdAt)} />
                    <InfoLine
                      label="Last Analysis"
                      value={
                        snapshot.analysis
                          ? formatDate(snapshot.analysis.createdAt)
                          : "Pending analysis"
                      }
                    />
                    <InfoLine label="Site" value={snapshot.plan.siteLabel} />
                    <InfoLine label="Floor Area" value={snapshot.plan.floorArea} />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <StatTile label="Rooms" value={String(snapshot.plan.roomDetections.length)} />
                    <StatTile label="Saved Steps" value={String(savedStepCount)} />
                    <StatTile
                      label="Workflow Stages"
                      value={String(snapshot.plan.workflowSteps.length)}
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <LinkButton href={`/design-ai/floor-plans/${snapshot.upload.id}`} size="sm">
                      Open Detail
                    </LinkButton>
                    <LinkButton href="/design-ai/floor-plans/new" size="sm" variant="secondary">
                      New Upload
                    </LinkButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Sample Library"
        description="These mock records remain available for safe UI and workflow validation."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-black/5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    {plan.propertyType}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">
                    {plan.projectName}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600">{plan.clientName}</p>
                </div>
                <StatusPill tone={statusTone(plan.status)}>{formatStatus(plan.status)}</StatusPill>
              </div>

              <p className="mt-4 text-sm leading-6 text-neutral-700">{plan.summary}</p>

              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <InfoLine label="Source File" value={plan.sourceFileName} />
                <InfoLine label="Floor Area" value={plan.floorArea} />
                <InfoLine label="Site" value={plan.siteLabel} />
                <InfoLine label="Last Analyzed" value={formatDate(plan.lastAnalyzedAt)} />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <StatTile label="Rooms" value={String(plan.roomDetections.length)} />
                <StatTile label="Furniture Keys" value={String(plan.furnitureLegend.length)} />
                <StatTile label="Workflow Steps" value={String(plan.workflowSteps.length)} />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <LinkButton href={`/design-ai/floor-plans/${plan.id}`} size="sm">
                  Open Detail
                </LinkButton>
                <LinkButton href="/design-ai/floor-plans/new" size="sm" variant="secondary">
                  New Upload
                </LinkButton>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </main>
  );
}

function MetricCard(props: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm shadow-black/5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
      <p className="mt-1 text-sm text-neutral-600">{props.subtitle}</p>
    </div>
  );
}

function StatTile(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-2 text-lg font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}

function InfoLine(props: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-1 font-medium text-neutral-900">{props.value}</p>
    </div>
  );
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value instanceof Date ? value : new Date(value));
}

function formatStatus(status: FloorPlanStatus) {
  return status.replaceAll("_", " ");
}

function statusTone(status: FloorPlanStatus): "success" | "warning" | "info" {
  if (status === "AI_READY") return "success";
  if (status === "REVIEW_PENDING") return "warning";
  return "info";
}
