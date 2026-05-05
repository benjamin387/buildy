import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  deleteDesignBrief,
  generateDesignBriefSummary,
  generateDesignConcept,
} from "@/app/(platform)/design-ai/actions";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";

export default async function DesignBriefDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const brief = await prisma.designBrief.findUnique({
    where: { id },
  });

  if (!brief) notFound();

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title={brief.clientName || "Design Brief"}
        subtitle="AI-powered design brief summary and planning"
        backHref="/design-ai/briefs"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/design-ai/briefs/${brief.id}/edit`}>
              <ActionButton type="button" variant="secondary">
                Edit Brief
              </ActionButton>
            </Link>
            <form action={deleteDesignBrief}>
              <input type="hidden" name="briefId" value={brief.id} />
              <ActionButton type="submit" variant="danger">
                Delete Brief
              </ActionButton>
            </form>
          </div>
        }
      />

      {/* BASIC INFO */}
      <SectionCard title="Project Overview">
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-neutral-500">Client Phone</p>
            <p className="font-semibold">
              {brief.clientPhone || "Not provided"}
            </p>
          </div>

          <div>
            <p className="text-neutral-500">Client Email</p>
            <p className="font-semibold">
              {brief.clientEmail || "Not provided"}
            </p>
          </div>

          <div>
            <p className="text-neutral-500">Property Type</p>
            <p className="font-semibold">{brief.propertyType}</p>
          </div>

          <div>
            <p className="text-neutral-500">Address</p>
            <p className="font-semibold">
              {brief.propertyAddress || "Not provided"}
            </p>
          </div>

          <div>
            <p className="text-neutral-500">Floor Area</p>
            <p className="font-semibold">
              {brief.floorArea ?? "Not set"}
            </p>
          </div>

          <div>
            <p className="text-neutral-500">Rooms</p>
            <p className="font-semibold">
              {brief.rooms ?? "Not set"}
            </p>
          </div>

          <div>
            <p className="text-neutral-500">Budget</p>
            <p className="font-semibold">
              {formatBudget(brief.budgetMin, brief.budgetMax)}
            </p>
          </div>

          <div>
            <p className="text-neutral-500">Status</p>
            <StatusPill>{brief.status.replaceAll("_", " ")}</StatusPill>
          </div>

          <div>
            <p className="text-neutral-500">Timeline</p>
            <p className="font-semibold">
              {brief.timeline || "Not set"}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* CLIENT REQUIREMENTS */}
      <SectionCard title="Client Requirements">
        <p className="text-sm text-neutral-700 whitespace-pre-wrap">
          {brief.requirements}
        </p>
      </SectionCard>

      {/* AI ACTION */}
      <SectionCard title="AI Assistant">
        <div className="flex flex-wrap items-center gap-2">
          <form action={generateDesignBriefSummary}>
            <input type="hidden" name="briefId" value={brief.id} />
            <ActionButton type="submit">
              Generate AI Brief
            </ActionButton>
          </form>

          {brief.aiSummary && (
            <form action={generateDesignConcept}>
              <input type="hidden" name="briefId" value={brief.id} />
              <ActionButton type="submit" variant="secondary">
                Generate Design Concept
              </ActionButton>
            </form>
          )}
        </div>
      </SectionCard>

      {/* AI OUTPUT */}
      {brief.aiSummary && (
        <SectionCard title="AI Summary">
          <p className="text-sm text-neutral-700 whitespace-pre-wrap">
            {brief.aiSummary}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-neutral-500">Recommended Style</p>
              <p className="font-semibold">
                {brief.aiRecommendedStyle || "—"}
              </p>
            </div>

            <div>
              <p className="text-neutral-500">Budget Risk</p>
              <p className="font-semibold">
                {brief.aiBudgetRisk || "—"}
              </p>
            </div>

            <div>
              <p className="text-neutral-500">Next Action</p>
              <p className="font-semibold">
                {brief.aiNextAction || "—"}
              </p>
            </div>
          </div>
        </SectionCard>
      )}
    </main>
  );
}

/* ============================= */
/* Helpers */
/* ============================= */

function toNullableNumber(
  value: { toString(): string } | number | null
): number | null {
  if (value === null) return null;
  return Number(value.toString());
}

function formatBudget(
  min: { toString(): string } | number | null,
  max: { toString(): string } | number | null
): string {
  const minN = toNullableNumber(min);
  const maxN = toNullableNumber(max);

  if (minN === null && maxN === null) return "Not set";
  if (minN !== null && maxN !== null)
    return `$${minN.toLocaleString()} - $${maxN.toLocaleString()}`;
  if (minN !== null) return `From $${minN.toLocaleString()}`;
  return `Up to $${maxN?.toLocaleString()}`;
}
