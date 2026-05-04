"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  defaultRenovationSections,
  type BuilderLineItemInput,
  type BuilderSectionInput,
} from "@/lib/quotation-engine/renovation-default-sections";
import { computeProjectQuotationSummary } from "@/lib/quotation-engine/project-quotation-math";

type FormState = {
  issueDate: string;
  validityDays: number;
  notes: string;
  discountAmount: number;
  sections: BuilderSectionInput[];
};

type CreatedQuotationResponse = {
  success: boolean;
  data?: { id: string };
  error?: string;
};

function todayIsoDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}%`;
}

function createBlankLineItem(): BuilderLineItemInput {
  return {
    sku: "",
    description: "",
    specification: "",
    unit: "lot",
    quantity: 0,
    unitPrice: 0,
    costPrice: 0,
    remarks: "",
    itemType: "SUPPLY_AND_INSTALL",
    isIncluded: true,
    isOptional: false,
  };
}

function createBlankSection(): BuilderSectionInput {
  return {
    category: "OTHER",
    title: "New Section",
    description: "",
    isIncluded: true,
    isOptional: false,
    remarks: "",
    lineItems: [createBlankLineItem()],
  };
}

export function ProjectQuotationBuilder(props: {
  projectId: string;
  projectName: string;
  clientName: string;
  gstRate: number;
}) {
  const [form, setForm] = useState<FormState>({
    issueDate: todayIsoDate(),
    validityDays: 14,
    notes: "",
    discountAmount: 0,
    sections: structuredClone(defaultRenovationSections),
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const summary = useMemo(() => {
    return computeProjectQuotationSummary({
      sections: form.sections,
      discountAmount: form.discountAmount,
      gstRate: props.gstRate,
    });
  }, [form.sections, form.discountAmount, props.gstRate]);

  function updateTopLevel<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSection(
    sectionIndex: number,
    updater: (section: BuilderSectionInput) => BuilderSectionInput,
  ) {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section, index) =>
        index === sectionIndex ? updater(section) : section,
      ),
    }));
  }

  function updateLineItem(
    sectionIndex: number,
    itemIndex: number,
    updater: (item: BuilderLineItemInput) => BuilderLineItemInput,
  ) {
    updateSection(sectionIndex, (section) => ({
      ...section,
      lineItems: section.lineItems.map((item, index) =>
        index === itemIndex ? updater(item) : item,
      ),
    }));
  }

  function addSection() {
    setForm((current) => ({
      ...current,
      sections: [...current.sections, createBlankSection()],
    }));
  }

  function removeSection(sectionIndex: number) {
    setForm((current) => {
      const remaining =
        current.sections.length === 1
          ? [createBlankSection()]
          : current.sections.filter((_, index) => index !== sectionIndex);
      return { ...current, sections: remaining };
    });
  }

  function addLineItem(sectionIndex: number) {
    updateSection(sectionIndex, (section) => ({
      ...section,
      lineItems: [...section.lineItems, createBlankLineItem()],
    }));
  }

  function removeLineItem(sectionIndex: number, itemIndex: number) {
    updateSection(sectionIndex, (section) => ({
      ...section,
      lineItems:
        section.lineItems.length === 1
          ? [createBlankLineItem()]
          : section.lineItems.filter((_, index) => index !== itemIndex),
    }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${props.projectId}/quotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload: CreatedQuotationResponse = await response.json();
      if (!payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to create quotation");
      }

      window.location.assign(`/projects/${props.projectId}/quotation/${payload.data.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create quotation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-100 px-6 py-10 text-neutral-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/projects/${props.projectId}/quotation`}
                className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
              >
                Back
              </Link>
              <span className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                Draft
              </span>
            </div>

            <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Project Quotation
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
              {props.projectName}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
              Client: {props.clientName}. Build your BOQ by section, enter SKU,
              selling price, and cost price to get live margin.
            </p>
          </div>

          <div className="grid gap-2 rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
            <div className="flex items-baseline justify-between gap-6">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
                Net Revenue
              </p>
              <p className="text-xl font-semibold">{formatCurrency(summary.revenueNet)}</p>
            </div>
            <div className="flex items-baseline justify-between gap-6">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
                Est Cost
              </p>
              <p className="text-xl font-semibold">{formatCurrency(summary.costSubtotal)}</p>
            </div>
            <div className="flex items-baseline justify-between gap-6">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
                Profit
              </p>
              <p className="text-xl font-semibold">{formatCurrency(summary.profitAmount)}</p>
            </div>
            <p className="text-xs text-neutral-300">{formatPct(summary.marginPercent)}</p>
          </div>
        </div>

        <section className="grid gap-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm lg:grid-cols-3">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Issue Date</span>
            <input
              type="date"
              value={form.issueDate}
              onChange={(e) => updateTopLevel("issueDate", e.target.value)}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Validity (days)</span>
            <input
              type="number"
              min={1}
              max={180}
              value={form.validityDays}
              onChange={(e) => updateTopLevel("validityDays", Number(e.target.value))}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Discount (SGD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.discountAmount}
              onChange={(e) => updateTopLevel("discountAmount", Number(e.target.value))}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-3">
            <span className="font-medium text-neutral-800">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => updateTopLevel("notes", e.target.value)}
              rows={2}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Internal notes (optional)"
            />
          </label>
        </section>

        {error ? (
          <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        ) : null}

        <div className="space-y-6">
          {form.sections.map((section, sectionIndex) => {
            const computedSection = summary.sections[sectionIndex];

            return (
              <section
                key={`${section.category}-${sectionIndex}`}
                className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                      Section
                    </p>
                    <input
                      value={section.title}
                      onChange={(e) =>
                        updateSection(sectionIndex, (current) => ({
                          ...current,
                          title: e.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-lg font-semibold text-neutral-950 outline-none ring-neutral-400 focus:ring-2"
                    />
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-neutral-950 px-4 py-3 text-white">
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
                        Profit
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {formatCurrency(computedSection?.profit ?? 0)}
                      </p>
                      <p className="mt-1 text-xs text-neutral-300">
                        Margin {formatPct(computedSection?.marginPercent ?? null)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSection(sectionIndex)}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                    >
                      Remove Section
                    </button>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-100 text-neutral-800">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold">SKU</th>
                        <th className="px-3 py-3 text-left font-semibold">Description</th>
                        <th className="px-3 py-3 text-left font-semibold">Unit</th>
                        <th className="px-3 py-3 text-right font-semibold">Qty</th>
                        <th className="px-3 py-3 text-right font-semibold">Unit Price</th>
                        <th className="px-3 py-3 text-right font-semibold">Cost Price</th>
                        <th className="px-3 py-3 text-right font-semibold">Total</th>
                        <th className="px-3 py-3 text-right font-semibold">Cost</th>
                        <th className="px-3 py-3 text-right font-semibold">Profit</th>
                        <th className="px-3 py-3 text-right font-semibold">Margin</th>
                        <th className="px-3 py-3 text-left font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.lineItems.map((item, itemIndex) => {
                        const computedItem = computedSection?.lineItems[itemIndex];

                        return (
                          <tr key={itemIndex} className="border-t border-neutral-200">
                            <td className="px-3 py-3">
                              <input
                                value={item.sku}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (current) => ({
                                    ...current,
                                    sku: e.target.value,
                                  }))
                                }
                                className="w-32 rounded-lg border border-neutral-200 bg-white px-2 py-1 outline-none ring-neutral-400 focus:ring-2"
                                placeholder="SKU"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={item.description}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (current) => ({
                                    ...current,
                                    description: e.target.value,
                                  }))
                                }
                                className="w-[420px] rounded-lg border border-neutral-200 bg-white px-2 py-1 outline-none ring-neutral-400 focus:ring-2"
                                placeholder="Item description"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={item.unit}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (current) => ({
                                    ...current,
                                    unit: e.target.value,
                                  }))
                                }
                                className="w-24 rounded-lg border border-neutral-200 bg-white px-2 py-1 outline-none ring-neutral-400 focus:ring-2"
                              />
                            </td>
                            <td className="px-3 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (current) => ({
                                    ...current,
                                    quantity: Number(e.target.value),
                                  }))
                                }
                                className="w-24 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-right outline-none ring-neutral-400 focus:ring-2"
                              />
                            </td>
                            <td className="px-3 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (current) => ({
                                    ...current,
                                    unitPrice: Number(e.target.value),
                                  }))
                                }
                                className="w-28 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-right outline-none ring-neutral-400 focus:ring-2"
                              />
                            </td>
                            <td className="px-3 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.costPrice}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (current) => ({
                                    ...current,
                                    costPrice: Number(e.target.value),
                                  }))
                                }
                                className="w-28 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-right outline-none ring-neutral-400 focus:ring-2"
                              />
                            </td>
                            <td className="px-3 py-3 text-right font-medium text-neutral-950">
                              {formatCurrency(computedItem?.totalPrice ?? 0)}
                            </td>
                            <td className="px-3 py-3 text-right text-neutral-900">
                              {formatCurrency(computedItem?.totalCost ?? 0)}
                            </td>
                            <td className="px-3 py-3 text-right font-medium text-neutral-950">
                              {formatCurrency(computedItem?.profit ?? 0)}
                            </td>
                            <td className="px-3 py-3 text-right text-neutral-900">
                              {formatPct(computedItem?.marginPercent ?? null)}
                            </td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                onClick={() => removeLineItem(sectionIndex, itemIndex)}
                                className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-neutral-600">
                    Section subtotal:{" "}
                    <span className="font-semibold text-neutral-900">
                      {formatCurrency(computedSection?.subtotal ?? 0)}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => addLineItem(sectionIndex)}
                    className="inline-flex items-center rounded-lg bg-neutral-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
                  >
                    Add Item
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={addSection}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Add Section
          </button>

          <button
            disabled={loading}
            onClick={handleSubmit}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-neutral-950 px-6 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
          >
            {loading ? "Saving..." : "Save Quotation"}
          </button>
        </div>
      </div>
    </main>
  );
}

