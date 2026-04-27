import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

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

export default async function PrintSubcontractPage({
  params,
}: {
  params: Promise<{ projectId: string; subcontractId: string }>;
}) {
  const { projectId, subcontractId } = await params;
  await requirePermission({ permission: Permission.SUBCONTRACT_READ, projectId });

  const subcontract = await prisma.subcontract.findUnique({
    where: { id: subcontractId },
    include: { project: true, supplier: true },
  });
  if (!subcontract || subcontract.projectId !== projectId) notFound();

  return (
    <main className="min-h-screen bg-neutral-100 px-6 py-10 text-neutral-900 print:bg-white print:px-0 print:py-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              .page { box-shadow: none !important; border: none !important; border-radius: 0 !important; }
            }
          `,
        }}
      />

      <div className="no-print mx-auto mb-6 flex max-w-4xl items-center justify-between">
        <Link
          href={`/projects/${projectId}/suppliers/subcontracts/${subcontractId}`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Back
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Print (Save as PDF)
        </button>
      </div>

      <div className="page mx-auto max-w-4xl rounded-2xl border border-neutral-200 bg-white p-10 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-8 print:shadow-none">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">Subcontract</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">{subcontract.title}</h1>
            <p className="mt-2 text-sm text-neutral-700">Supplier: {subcontract.supplier.name}</p>
            <p className="mt-2 text-sm text-neutral-700">
              Commence: {formatDate(subcontract.commencementDate)} · Complete: {formatDate(subcontract.completionDate)}
            </p>
            <p className="mt-2 text-sm text-neutral-700">Status: {subcontract.status}</p>
          </div>

          <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-sm sm:text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Total</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(Number(subcontract.totalAmount))}</p>
            <p className="mt-1 text-xs text-neutral-300">
              Subtotal {formatCurrency(Number(subcontract.contractSubtotal))} · GST {formatCurrency(Number(subcontract.gstAmount))}
            </p>
          </div>
        </header>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Project</p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">{subcontract.project.name}</p>
            <p className="mt-1 text-sm text-neutral-700">
              {subcontract.project.addressLine1}
              {subcontract.project.addressLine2 ? `, ${subcontract.project.addressLine2}` : ""}
              {subcontract.project.postalCode ? ` ${subcontract.project.postalCode}` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Supplier</p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">{subcontract.supplier.name}</p>
            {subcontract.supplier.email ? <p className="mt-1 text-sm text-neutral-700">{subcontract.supplier.email}</p> : null}
            {subcontract.supplier.phone ? <p className="mt-1 text-sm text-neutral-700">{subcontract.supplier.phone}</p> : null}
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-neutral-200 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Scope Summary</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{subcontract.scopeSummary ?? subcontract.scopeOfWork ?? "-"}</p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <Block title="Payment Terms" value={subcontract.paymentTerms} />
          <Block title="Warranty" value={subcontract.warrantyTerms} />
          <Block title="Variation Policy" value={subcontract.variationPolicy} />
          <Block title="Defects Policy" value={subcontract.defectsPolicy} />
          <Block title="Insurance" value={subcontract.insurancePolicy} />
          <Block title="Notes" value={subcontract.notes} />
        </section>
      </div>
    </main>
  );
}

function Block(props: { title: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{props.value?.trim() ? props.value : "-"}</p>
    </div>
  );
}

