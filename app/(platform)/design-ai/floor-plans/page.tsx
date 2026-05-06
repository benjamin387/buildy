import { requireUser } from "@/lib/auth/session";
import {
  getMockFloorPlanMetrics,
  listMockFloorPlans,
  type FloorPlanStatus,
} from "@/lib/design-ai/floor-plan-engine";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { LinkButton } from "@/app/(platform)/design-ai/floor-plans/_components/link-button";

export default async function FloorPlansPage() {
  await requireUser();

  const plans = listMockFloorPlans();
  const metrics = getMockFloorPlanMetrics();

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title="AI Floor Plans"
        subtitle="Review mock floor plan intelligence, room zoning, and downstream renovation guidance before the live parser is connected."
        backHref="/design-ai"
        actions={
          <LinkButton href="/design-ai/floor-plans/new">New Floor Plan</LinkButton>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Mock Plans" value={String(metrics.totalPlans)} subtitle="In-memory records only" />
        <MetricCard title="AI Ready" value={String(metrics.readyPlans)} subtitle="Ready for prompt and costing review" />
        <MetricCard title="Rooms Parsed" value={String(metrics.totalDetectedRooms)} subtitle="Detected across all samples" />
        <MetricCard title="3D Prompts" value={String(metrics.totalPerspectivePrompts)} subtitle="Perspective prompts prepared" />
      </section>

      <SectionCard
        title="Floor Plan Library"
        description="These records are mock-only and are safe for UI and workflow validation."
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(status: FloorPlanStatus) {
  return status.replaceAll("_", " ");
}

function statusTone(status: FloorPlanStatus): "success" | "warning" | "info" {
  if (status === "AI_READY") return "success";
  if (status === "REVIEW_PENDING") return "warning";
  return "info";
}
