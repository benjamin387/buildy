import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatPropertyType(value: string): string {
  return value
    .split("_")
    .map((part) => `${part[0]}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function formatScopeCategory(value: string): string {
  return value
    .split("_")
    .map((part) => `${part[0]}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      client: true,
      project: true,
      sections: {
        include: {
          lineItems: {
            orderBy: {
              sortOrder: "asc",
            },
          },
        },
        orderBy: {
          sortOrder: "asc",
        },
      },
      acceptance: true,
    },
  });

  if (!quotation) {
    notFound();
  }

  const totalLineItems = quotation.sections.reduce(
    (sum, section) => sum + section.lineItems.length,
    0,
  );

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/quotation"
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back to Legacy List
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Dashboard
            </Link>
            <Link
              href="/projects"
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Projects
            </Link>
            <span className="inline-flex rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-800">
              Legacy
            </span>
            <span className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              {quotation.status}
            </span>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Legacy Quotation Detail
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {quotation.quotationNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Legacy quotation view. For project-linked quotations, open a project and use the Quotations tab.
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
            Total Amount
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {formatCurrency(Number(quotation.totalAmount))}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-950">
                Quotation Summary
              </h2>

              <div className="mt-5 space-y-4">
                <DetailRow
                  label="Reference Number"
                  value={quotation.quotationNumber}
                />
                <DetailRow
                  label="Quotation Date"
                  value={formatDate(quotation.issueDate)}
                />
                <DetailRow
                  label="Validity"
                  value={`${quotation.validityDays ?? 14} days`}
                />
                <DetailRow
                  label="Property Type"
                  value={formatPropertyType(quotation.propertyType)}
                />
                <DetailRow
                  label="Unit Size"
                  value={
                    quotation.unitSizeSqft
                      ? `${Number(quotation.unitSizeSqft)} sqft`
                      : "-"
                  }
                />
                <DetailRow
                  label="Sections"
                  value={`${quotation.sections.length}`}
                />
                <DetailRow
                  label="Line Items"
                  value={`${totalLineItems}`}
                />
                <DetailRow
                  label="Created At"
                  value={formatDate(quotation.createdAt)}
                />
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-950">
                Client Details
              </h2>

              <div className="mt-5 space-y-4">
                <DetailRow
                  label="Client Name"
                  value={quotation.clientNameSnapshot}
                />
                <DetailRow
                  label="Company"
                  value={quotation.companyNameSnapshot || "-"}
                />
                <DetailRow
                  label="Contact Person"
                  value={quotation.contactPersonSnapshot || "-"}
                />
                <DetailRow
                  label="Phone"
                  value={quotation.contactPhoneSnapshot || "-"}
                />
                <DetailRow
                  label="Email"
                  value={quotation.contactEmailSnapshot || "-"}
                />
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-950">
                Project Details
              </h2>

              <div className="mt-5 space-y-4">
                <DetailRow
                  label="Project Name"
                  value={quotation.projectNameSnapshot}
                />
                <DetailRow
                  label="Address Line 1"
                  value={quotation.projectAddress1}
                />
                <DetailRow
                  label="Address Line 2"
                  value={quotation.projectAddress2 || "-"}
                />
                <DetailRow
                  label="Postal Code"
                  value={quotation.projectPostalCode || "-"}
                />
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-950">
                Pricing Summary
              </h2>

              <div className="mt-5 grid gap-3">
                <SummaryRow
                  label="Subtotal"
                  value={Number(quotation.subtotal)}
                />
                <SummaryRow
                  label="Discount"
                  value={Number(quotation.discountAmount)}
                />
                <SummaryRow
                  label="GST"
                  value={Number(quotation.gstAmount)}
                />
                <SummaryRow
                  label="Total"
                  value={Number(quotation.totalAmount)}
                  strong
                />
              </div>
            </section>
          </aside>

          <section className="space-y-6">
            <section className="rounded-xl border border-neutral-300 bg-white p-6 shadow-md">
              <h2 className="text-xl font-semibold text-neutral-950">
                Scope of Work
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Included and optional scope sections with line item breakdown.
              </p>

              <div className="mt-6 space-y-6">
                {quotation.sections.map((section, sectionIndex) => (
                  <div
                    key={section.id}
                    className="rounded-2xl border border-neutral-300 bg-neutral-50"
                  >
                    <div className="flex flex-col gap-4 border-b border-neutral-300 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                            Section {sectionIndex + 1}
                          </span>
                          <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
                            {formatScopeCategory(section.category)}
                          </span>
                          {!section.isIncluded ? (
                            <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                              Excluded
                            </span>
                          ) : null}
                          {section.isOptional ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                              Optional
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-3 text-xl font-semibold text-neutral-950">
                          {section.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-neutral-600">
                          {section.description || "No section description."}
                        </p>
                        {section.remarks ? (
                          <p className="mt-2 text-sm text-neutral-700">
                            <span className="font-semibold">Remarks:</span>{" "}
                            {section.remarks}
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-xl bg-neutral-950 px-4 py-3 text-white">
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
                          Section Subtotal
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {formatCurrency(Number(section.subtotal))}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-b-2xl">
                      <table className="min-w-full text-sm">
                        <thead className="bg-neutral-200 text-neutral-800">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">
                              Description
                            </th>
                            <th className="px-4 py-3 text-left font-semibold">
                              Unit
                            </th>
                            <th className="px-4 py-3 text-left font-semibold">
                              Qty
                            </th>
                            <th className="px-4 py-3 text-left font-semibold">
                              Rate
                            </th>
                            <th className="px-4 py-3 text-left font-semibold">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.lineItems.map((item) => (
                            <tr key={item.id} className="border-t border-neutral-200 bg-white">
                              <td className="px-4 py-4 align-top">
                                <p className="font-medium text-neutral-900">
                                  {item.description}
                                </p>
                                {item.specification ? (
                                  <p className="mt-1 text-sm text-neutral-600">
                                    {item.specification}
                                  </p>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-700">
                                    {item.itemType}
                                  </span>
                                  {!item.isIncluded ? (
                                    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
                                      Excluded
                                    </span>
                                  ) : null}
                                  {item.isOptional ? (
                                    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                                      Optional
                                    </span>
                                  ) : null}
                                </div>
                                {item.remarks ? (
                                  <p className="mt-2 text-sm text-neutral-700">
                                    <span className="font-semibold">Remarks:</span>{" "}
                                    {item.remarks}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-4 py-4 text-neutral-700">
                                {item.unit}
                              </td>
                              <td className="px-4 py-4 text-neutral-900">
                                {Number(item.quantity)}
                              </td>
                              <td className="px-4 py-4 text-neutral-900">
                                {formatCurrency(Number(item.unitPrice))}
                              </td>
                              <td className="px-4 py-4 font-semibold text-neutral-950">
                                {formatCurrency(Number(item.totalPrice))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-neutral-300 bg-white p-6 shadow-md">
                <h2 className="text-lg font-semibold text-neutral-950">
                  Exclusions
                </h2>
                <p className="mt-4 whitespace-pre-line text-sm leading-6 text-neutral-700">
                  {quotation.exclusions || "No exclusions stated."}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-300 bg-white p-6 shadow-md">
                <h2 className="text-lg font-semibold text-neutral-950">
                  Payment Terms
                </h2>
                <p className="mt-4 whitespace-pre-line text-sm leading-6 text-neutral-700">
                  {quotation.paymentTerms || "No payment terms stated."}
                </p>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-neutral-300 bg-white p-6 shadow-md">
                <h2 className="text-lg font-semibold text-neutral-950">
                  Notes
                </h2>
                <p className="mt-4 whitespace-pre-line text-sm leading-6 text-neutral-700">
                  {quotation.notes || "No notes added."}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-300 bg-white p-6 shadow-md">
                <h2 className="text-lg font-semibold text-neutral-950">
                  Acceptance
                </h2>

                {quotation.acceptance ? (
                  <div className="mt-4 space-y-4">
                    <DetailRow
                      label="Accepted By"
                      value={quotation.acceptance.acceptedByName || "-"}
                    />
                    <DetailRow
                      label="Company"
                      value={quotation.acceptance.acceptedByCompany || "-"}
                    />
                    <DetailRow
                      label="Accepted At"
                      value={
                        quotation.acceptance.acceptedAt
                          ? formatDate(quotation.acceptance.acceptedAt)
                          : "-"
                      }
                    />
                    <DetailRow
                      label="Notes"
                      value={quotation.acceptance.notes || "-"}
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-neutral-700">
                    No acceptance record yet.
                  </p>
                )}
              </div>
            </section>
          </section>
      </div>
    </main>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium text-neutral-900">
        {value}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
        strong
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 bg-neutral-50"
      }`}
    >
      <span
        className={`text-sm ${
          strong ? "text-neutral-200" : "text-neutral-700"
        }`}
      >
        {label}
      </span>
      <span
        className={`font-semibold ${
          strong ? "text-white" : "text-neutral-950"
        }`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}
