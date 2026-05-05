import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { deleteDesignBrief } from "@/app/(platform)/design-ai/actions";
import { PageHeader } from "@/app/components/ui/page-header";
import { ActionButton } from "@/app/components/ui/action-button";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { EmptyState } from "@/app/components/ui/empty-state";

export default async function DesignAiBriefsPage() {
  await requireUser();

  const briefs = await prisma.designBrief.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientName: true,
      propertyType: true,
      propertyAddress: true,
      budgetMin: true,
      budgetMax: true,
      status: true,
      aiSummary: true,
      createdAt: true,
    },
  });

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title="Design Briefs"
        subtitle="Create and track structured briefs before moving to concept development."
        backHref="/design-ai"
        actions={
          <Link href="/design-ai/briefs/new">
            <ActionButton>Create Design Brief</ActionButton>
          </Link>
        }
      />

      <SectionCard>
        {briefs.length === 0 ? (
          <EmptyState
            title="No design briefs yet"
            description="Create your first AI design brief to start generating summary and concept output."
            ctaLabel="Create Design Brief"
            ctaHref="/design-ai/briefs/new"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.16em] text-neutral-500">
                  <th className="py-3 pr-4">Client</th>
                  <th className="py-3 pr-4">Property</th>
                  <th className="py-3 pr-4">Budget</th>
                  <th className="py-3 pr-4">AI</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {briefs.map((brief) => (
                  <tr key={brief.id}>
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-neutral-900">{brief.clientName || "Untitled Client"}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-neutral-900">{brief.propertyType}</p>
                      <p className="text-xs text-neutral-500">{brief.propertyAddress || "No address"}</p>
                    </td>
                    <td className="py-3 pr-4 text-neutral-700">{formatBudget(brief.budgetMin, brief.budgetMax)}</td>
                    <td className="py-3 pr-4">{brief.aiSummary ? <StatusPill tone="success">Ready</StatusPill> : <StatusPill tone="warning">Pending</StatusPill>}</td>
                    <td className="py-3 pr-4"><StatusPill>{brief.status.replaceAll("_", " ")}</StatusPill></td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/design-ai/briefs/${brief.id}`}>
                          <ActionButton type="button" size="sm" variant="secondary">
                            Open
                          </ActionButton>
                        </Link>
                        <Link href={`/design-ai/briefs/${brief.id}/edit`}>
                          <ActionButton type="button" size="sm" variant="secondary">
                            Edit
                          </ActionButton>
                        </Link>
                        <form action={deleteDesignBrief}>
                          <input type="hidden" name="briefId" value={brief.id} />
                          <ActionButton type="submit" size="sm" variant="danger">
                            Delete
                          </ActionButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function toNullableNumber(value: { toString(): string } | number | null): number | null {
  if (value === null) return null;
  return Number(value.toString());
}

function formatBudget(min: { toString(): string } | number | null, max: { toString(): string } | number | null): string {
  const minN = toNullableNumber(min);
  const maxN = toNullableNumber(max);
  if (minN === null && maxN === null) return "Not set";
  if (minN !== null && maxN !== null) return `$${minN.toLocaleString()} - $${maxN.toLocaleString()}`;
  if (minN !== null) return `From $${minN.toLocaleString()}`;
  return `Up to $${maxN?.toLocaleString()}`;
}
