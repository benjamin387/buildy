import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";

export default async function DesignAiPage() {
  await requireUser();

  const [totalBriefs, aiReviewed, concepts] = await Promise.all([
    prisma.designBrief.count(),
    prisma.designBrief.count({ where: { aiSummary: { not: null } } }),
    prisma.designConcept.count(),
  ]);

  const latestBriefs = await prisma.designBrief.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      clientName: true,
      status: true,
      propertyType: true,
      createdAt: true,
      aiSummary: true,
    },
  });

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title="AI Design Brief Engine"
        subtitle="Generate premium design briefs, AI strategy summaries, and room-by-room concepts in one workflow."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/design-ai/sales">
              <ActionButton variant="secondary">Open Sales</ActionButton>
            </Link>
            <Link href="/design-ai/boq">
              <ActionButton variant="secondary">Open BOQ</ActionButton>
            </Link>
            <Link href="/design-ai/briefs/new">
              <ActionButton>Create Design Brief</ActionButton>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Total Briefs" value={String(totalBriefs)} subtitle="All created briefs" />
        <MetricCard title="AI Summaries" value={String(aiReviewed)} subtitle="Briefs with AI strategy" />
        <MetricCard title="Design Concepts" value={String(concepts)} subtitle="Generated concept packs" />
      </section>

      <SectionCard
        title="Latest Design Briefs"
        description="Most recent briefs across your team"
        actions={
          <Link href="/design-ai/briefs">
            <ActionButton variant="secondary" size="sm">View All Briefs</ActionButton>
          </Link>
        }
      >
        <div className="space-y-3">
          {latestBriefs.length === 0 ? (
            <p className="text-sm text-neutral-600">No design briefs yet.</p>
          ) : (
            latestBriefs.map((brief) => (
              <Link
                key={brief.id}
                href={`/design-ai/briefs/${brief.id}`}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{brief.clientName || "Untitled Client"}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{brief.propertyType}</p>
                </div>
                <div className="flex items-center gap-2">
                  {brief.aiSummary ? <StatusPill tone="success">AI Ready</StatusPill> : <StatusPill tone="warning">Pending AI</StatusPill>}
                  <StatusPill>{brief.status.replaceAll("_", " ")}</StatusPill>
                </div>
              </Link>
            ))
          )}
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
