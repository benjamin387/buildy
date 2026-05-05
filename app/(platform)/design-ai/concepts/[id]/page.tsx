import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { normalizeDesignConcept } from "@/lib/design-ai/concept";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { generateDesignBOQ } from "@/app/(platform)/design-ai/actions";

export default async function DesignConceptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const concept = await prisma.designConcept.findUnique({
    where: { id },
    include: {
      designBrief: {
        select: {
          id: true,
          clientName: true,
          propertyType: true,
          preferredStyle: true,
          aiSummary: true,
          status: true,
        },
      },
    },
  });

  if (!concept) notFound();

  const hydratedConcept = normalizeDesignConcept(
    {
      clientName: concept.designBrief.clientName || "Client",
      propertyType: concept.designBrief.propertyType,
      preferredStyle: concept.designBrief.preferredStyle,
      aiSummary: concept.designBrief.aiSummary,
    },
    concept,
  );

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title={hydratedConcept.title}
        subtitle="AI-generated concept package for client presentation and internal alignment."
        backHref={`/design-ai/briefs/${concept.designBriefId}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill tone="info">Concept Ready</StatusPill>
            <form action={generateDesignBOQ}>
              <input type="hidden" name="conceptId" value={concept.id} />
              <ActionButton type="submit" size="sm">Generate BOQ</ActionButton>
            </form>
          </div>
        }
      />

      <SectionCard title="Overview">
        <div className="grid gap-4 sm:grid-cols-2">
          <Info label="Theme" value={hydratedConcept.theme} />
          <Info label="Client" value={concept.designBrief.clientName || "-"} />
          <Info label="Property Type" value={concept.designBrief.propertyType} />
          <Info label="Brief Status" value={concept.designBrief.status.replaceAll("_", " ")} />
        </div>
      </SectionCard>

      <SectionCard title="Concept Summary">
        <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-700">{hydratedConcept.conceptSummary}</p>
      </SectionCard>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Living Room Concept"><Body value={hydratedConcept.livingRoomConcept} /></SectionCard>
        <SectionCard title="Bedroom Concept"><Body value={hydratedConcept.bedroomConcept} /></SectionCard>
        <SectionCard title="Kitchen Concept"><Body value={hydratedConcept.kitchenConcept} /></SectionCard>
        <SectionCard title="Bathroom Concept"><Body value={hydratedConcept.bathroomConcept} /></SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Material Palette"><Body value={hydratedConcept.materialPalette} /></SectionCard>
        <SectionCard title="Lighting Plan"><Body value={hydratedConcept.lightingPlan} /></SectionCard>
        <SectionCard title="Furniture Direction"><Body value={hydratedConcept.furnitureDirection} /></SectionCard>
        <SectionCard title="Renovation Scope"><Body value={hydratedConcept.renovationScope} /></SectionCard>
      </section>

      <Link href={`/design-ai/briefs/${concept.designBriefId}`} className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-slate-50">
        Back to Brief
      </Link>
    </main>
  );
}

function Info(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">{props.label}</p>
      <p className="mt-1 text-sm text-neutral-900">{props.value}</p>
    </div>
  );
}

function Body(props: { value: string | null }) {
  return <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-700">{props.value || "-"}</p>;
}
