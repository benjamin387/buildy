import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import {
  certifySubcontractClaimAction,
  createSubcontractClaimAction,
  markSubcontractClaimPaidAction,
} from "@/app/(platform)/projects/[projectId]/suppliers/subcontracts/[subcontractId]/actions";
import { MessagingPanel } from "@/app/(platform)/components/messaging-panel";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function SubcontractDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; subcontractId: string }>;
}) {
  const { projectId, subcontractId } = await params;
  await requirePermission({ permission: Permission.SUBCONTRACT_READ, projectId });

  const subcontract = await prisma.subcontract.findUnique({
    where: { id: subcontractId },
    include: { supplier: true },
  });
  if (!subcontract || subcontract.projectId !== projectId) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, projectCode: true },
  });

  const claims = await prisma.subcontractClaim.findMany({
    where: { subcontractId: subcontract.id },
    orderBy: [{ claimDate: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const linkedBills = await prisma.supplierBill.findMany({
    where: { projectId, subcontractId: subcontract.id },
    include: { supplier: true },
    orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  const claimedTotal = claims.reduce((sum, c) => sum + Number(c.claimedAmount ?? 0), 0);
  const certifiedTotal = claims.reduce((sum, c) => sum + Number(c.certifiedAmount ?? 0), 0);
  const paidTotal = claims
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + Number(c.certifiedAmount ?? 0), 0);

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/suppliers`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-800">
              {subcontract.status}
            </span>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Subcontract
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {subcontract.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Supplier: {subcontract.supplier.name}
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
            Subcontract Value
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {formatCurrency(Number(subcontract.totalAmount))}
          </p>
          <p className="mt-1 text-xs text-neutral-300">
            Subtotal {formatCurrency(Number(subcontract.contractSubtotal))} · GST{" "}
            {formatCurrency(Number(subcontract.gstAmount))}
          </p>
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:grid-cols-3">
        <Metric title="Claimed" value={formatCurrency(claimedTotal)} />
        <Metric title="Certified" value={formatCurrency(certifiedTotal)} />
        <Metric title="Paid (Certified)" value={formatCurrency(paidTotal)} />
      </section>

      <MessagingPanel
        returnTo={`/projects/${projectId}/suppliers/subcontracts/${subcontractId}`}
        projectId={projectId}
        relatedType="SUBCONTRACT"
        relatedId={subcontractId}
        documentType="SUBCONTRACT"
        documentId={subcontractId}
        defaultRecipientName={subcontract.supplier.name}
        defaultRecipientEmail={subcontract.supplier.email ?? null}
        defaultRecipientPhone={subcontract.supplier.phone ?? null}
        defaultSubject={`Subcontract - ${subcontract.title}${project ? ` (${project.name})` : ""}`}
        defaultBody={`Dear ${subcontract.supplier.name},\n\nPlease find the subcontract for ${project?.name ?? "the project"}.\nScope: ${subcontract.title}\n\nThank you.`}
        defaultChannel="EMAIL"
      />

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Controls</h2>
        <div className="mt-5 space-y-4 text-sm text-neutral-700">
          <Block title="Scope of Work" value={subcontract.scopeOfWork} />
          <Block title="Payment Terms" value={subcontract.paymentTerms} />
          <Block title="Warranty" value={subcontract.warrantyTerms} />
          <Block title="Variation Policy" value={subcontract.variationPolicy} />
          <Block title="Defects Policy" value={subcontract.defectsPolicy} />
          <Block title="Insurance" value={subcontract.insurancePolicy} />
          <Block title="Notes" value={subcontract.notes} />
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Claims</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Track submitted and certified progress claims for this subcontract.
          </p>
        </div>

        <div className="p-6">
          <form action={createSubcontractClaimAction} className="grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="subcontractId" value={subcontractId} />

            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Claim Date</span>
              <input
                name="claimDate"
                type="date"
                required
                defaultValue={todayIsoDate()}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Claimed Amount</span>
              <input
                name="claimedAmount"
                type="number"
                min={0}
                step="0.01"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
                placeholder="0.00"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Certified Amount (optional)</span>
              <input
                name="certifiedAmount"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
                placeholder="0.00"
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-5">
              <span className="font-medium text-neutral-800">Notes (optional)</span>
              <input
                name="notes"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Claim for carpentry stage 1"
              />
            </label>
            <div className="flex justify-end sm:col-span-1">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Add Claim
              </button>
            </div>
          </form>
        </div>

        {claims.length === 0 ? (
          <div className="border-t border-neutral-200 px-6 py-6 text-sm text-neutral-600">
            No claims recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border-t border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Claim No</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Claimed</th>
                  <th className="px-4 py-3 text-right font-semibold">Certified</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => {
                  const canCertify = c.status === "SUBMITTED";
                  const canMarkPaid = c.status === "CERTIFIED";
                  return (
                    <tr key={c.id} className="border-t border-neutral-200 bg-white">
                      <td className="px-4 py-3 font-medium text-neutral-900">{c.claimNumber}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatDate(c.claimDate)}</td>
                      <td className="px-4 py-3 text-neutral-700">{c.status}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">
                        {formatCurrency(Number(c.claimedAmount))}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-900">
                        {formatCurrency(Number(c.certifiedAmount))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {canCertify ? (
                            <form action={certifySubcontractClaimAction} className="flex items-center gap-2">
                              <input type="hidden" name="projectId" value={projectId} />
                              <input type="hidden" name="subcontractId" value={subcontractId} />
                              <input type="hidden" name="subcontractClaimId" value={c.id} />
                              <input
                                name="certifiedAmount"
                                type="number"
                                min={0}
                                step="0.01"
                                defaultValue={Number(c.claimedAmount)}
                                className="h-10 w-32 rounded-lg border border-neutral-300 bg-white px-2 text-right outline-none ring-neutral-400 focus:ring-2"
                              />
                              <button className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-3 text-sm font-semibold text-white transition hover:bg-neutral-800">
                                Certify
                              </button>
                            </form>
                          ) : null}

                          {canMarkPaid ? (
                            <form action={markSubcontractClaimPaidAction}>
                              <input type="hidden" name="projectId" value={projectId} />
                              <input type="hidden" name="subcontractId" value={subcontractId} />
                              <input type="hidden" name="subcontractClaimId" value={c.id} />
                              <button className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                                Mark Paid
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Linked Supplier Bills</h2>
        </div>
        {linkedBills.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No bills linked to this subcontract.</div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Bill No</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Subtotal</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {linkedBills.map((b) => (
                  <tr key={b.id} className="border-t border-neutral-200 bg-white">
                    <td className="px-4 py-3 font-medium text-neutral-900">{b.billNumber}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(b.billDate)}</td>
                    <td className="px-4 py-3 text-neutral-700">{b.status}</td>
                    <td className="px-4 py-3 text-right text-neutral-900">
                      {formatCurrency(Number(b.subtotal))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">
                      {formatCurrency(Number(b.totalAmount))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/projects/${projectId}/supplier-bills/${b.id}`}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Block(props: { title: string; value: string | null | undefined }) {
  if (!props.value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-1 whitespace-pre-wrap leading-6">{props.value}</p>
    </div>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-2 text-2xl font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}
