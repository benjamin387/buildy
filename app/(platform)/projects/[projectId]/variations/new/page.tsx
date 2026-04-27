import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { createVariationAction } from "@/app/(platform)/projects/[projectId]/variations/actions";
import { VariationBuilder } from "@/app/(platform)/projects/[projectId]/variations/shared/variation-builder";

export default async function NewVariationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      projectCode: true,
      clientName: true,
      clientEmail: true,
      commercialProfile: { select: { gstRate: true } },
    },
  });
  if (!project) notFound();

  const gstRate = project.commercialProfile?.gstRate ? Number(project.commercialProfile.gstRate) : 0.09;

  const [itemMasters, contracts, quotations] = await Promise.all([
    prisma.itemMaster.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ sku: "asc" }],
      take: 500,
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        sellPrice: true,
        costPrice: true,
        unitId: true,
        unit: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.contract.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: { id: true, contractNumber: true, status: true },
    }),
    prisma.quotation.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: { id: true, quotationNumber: true, version: true, status: true },
    }),
  ]);

  return (
    <main className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Project / Variation Orders
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              New Variation Order
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              Create a draft VO. When ready, submit it for client approval and then invoice against the approved scope.
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/variations`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Back to Variations
          </Link>
        </div>
      </section>

      <form action={createVariationAction} className="space-y-6">
        <input type="hidden" name="projectId" value={projectId} />

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Header</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Title</span>
              <input
                name="title"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Additional carpentry works"
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Description</span>
              <textarea
                name="description"
                rows={3}
                className="rounded-xl border border-neutral-300 bg-white p-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Describe the requested changes and scope."
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Reason</span>
              <input
                name="reason"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Client request"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Requested By</span>
              <input
                name="requestedBy"
                defaultValue={project.clientName ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Client / PM"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Contract (optional)</span>
              <select
                name="contractId"
                defaultValue=""
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              >
                <option value="">(Not linked)</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contractNumber} · {c.status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Quotation (optional)</span>
              <select
                name="quotationId"
                defaultValue=""
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              >
                <option value="">(Not linked)</option>
                {quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.quotationNumber} v{q.version} · {q.status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Time Impact (days)</span>
              <input
                name="timeImpactDays"
                type="number"
                min={0}
                step={1}
                defaultValue={0}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            GST rate used for calculations: {(gstRate * 100).toFixed(1)}%
          </p>
        </section>

        <VariationBuilder
          gstRate={gstRate}
          itemMasters={itemMasters.map((m) => ({
            ...m,
            sellPrice: Number(m.sellPrice),
            costPrice: Number(m.costPrice),
          }))}
        />

        <div className="flex justify-end">
          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-6 text-sm font-semibold text-white transition hover:bg-neutral-800">
            Create Draft VO
          </button>
        </div>
      </form>
    </main>
  );
}

