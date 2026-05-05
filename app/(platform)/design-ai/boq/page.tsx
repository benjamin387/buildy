import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { EmptyState } from "@/app/components/ui/empty-state";

export default async function DesignBoqListPage() {
  await requireUser();

  const boqs = await prisma.designBOQ.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      designBrief: { select: { id: true, clientName: true, propertyType: true } },
      designConcept: { select: { id: true, title: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title="AI BOQ"
        subtitle="Generated BOQs from design concepts, ready for pricing edits and quotation conversion."
        backHref="/design-ai"
      />

      <SectionCard title="BOQ Register">
        {boqs.length === 0 ? (
          <EmptyState
            title="No BOQs yet"
            description="Generate a BOQ from a design concept first."
            ctaLabel="Go to Briefs"
            ctaHref="/design-ai/briefs"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.16em] text-neutral-500">
                  <th className="py-3 pr-4">BOQ</th>
                  <th className="py-3 pr-4">Client</th>
                  <th className="py-3 pr-4">Concept</th>
                  <th className="py-3 pr-4">Items</th>
                  <th className="py-3 pr-4">Totals</th>
                  <th className="py-3 pr-4">Margin</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {boqs.map((boq) => (
                  <tr key={boq.id}>
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-neutral-900">{boq.title}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-neutral-900">{boq.designBrief.clientName || "-"}</p>
                      <p className="text-xs text-neutral-500">{boq.designBrief.propertyType}</p>
                    </td>
                    <td className="py-3 pr-4 text-neutral-700">{boq.designConcept.title}</td>
                    <td className="py-3 pr-4 text-neutral-700">{boq._count.items}</td>
                    <td className="py-3 pr-4 text-neutral-700">
                      <p>Cost: {money(boq.totalCost)}</p>
                      <p>Selling: {money(boq.totalSellingPrice)}</p>
                    </td>
                    <td className="py-3 pr-4 text-neutral-700">{Number(boq.grossMargin).toFixed(2)}%</td>
                    <td className="py-3 pr-4">
                      <StatusPill tone={boq.status === "CONVERTED" ? "success" : "warning"}>{boq.status}</StatusPill>
                    </td>
                    <td className="py-3">
                      <Link href={`/design-ai/boq/${boq.id}`} className="text-sm font-semibold text-neutral-900 hover:text-neutral-600">
                        Open
                      </Link>
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

function money(value: { toString(): string } | number): string {
  return `$${Number(value.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
