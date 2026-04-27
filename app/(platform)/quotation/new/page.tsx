"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  defaultRenovationSections,
  type BuilderLineItemInput,
  type BuilderSectionInput,
  type ScopeCategory,
} from "@/lib/quotation-engine/renovation-default-sections";
import { calculateRenovationQuote } from "@/lib/quotation-engine/renovation-calculator";

type FormState = {
  clientName: string;
  companyName: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  projectName: string;
  projectAddress1: string;
  projectAddress2: string;
  projectPostalCode: string;
  propertyType: "HDB" | "CONDO" | "LANDED" | "COMMERCIAL" | "OTHER";
  unitSizeSqft: number;
  quotationDate: string;
  validityDays: number;
  paymentTerms: string;
  exclusions: string;
  notes: string;
  discountAmount: number;
  sections: BuilderSectionInput[];
};

type CreatedQuotationResponse = {
  success: boolean;
  data?: {
    id: string;
    quoteReferenceNumber: string;
    totalAmount: number;
  };
  error?: string;
};

type AiDraftResponse = {
  success: boolean;
  data?: {
    projectName: string;
    assumptions: string[];
    sections: BuilderSectionInput[];
  };
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

function getCategoryLabel(category: ScopeCategory): string {
  return category
    .split("_")
    .map((part) => `${part[0]}${part.slice(1).toLowerCase()}`)
    .join(" ");
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

export default function NewRenovationQuotationPage() {
  const [form, setForm] = useState<FormState>({
    clientName: "Benjamin Yeo",
    companyName: "",
    contactPerson: "Benjamin Yeo",
    contactPhone: "",
    contactEmail: "",
    projectName: "Tanjong Pagar Condo Renovation",
    projectAddress1: "Tanjong Pagar, Singapore",
    projectAddress2: "",
    projectPostalCode: "",
    propertyType: "CONDO",
    unitSizeSqft: 980,
    quotationDate: todayIsoDate(),
    validityDays: 14,
    paymentTerms:
      "50% deposit upon confirmation, 40% progress payment, 10% upon completion.",
    exclusions:
      "Aircon works, loose furniture, statutory submission fees, and unforeseen site conditions unless otherwise stated.",
    notes: "",
    discountAmount: 0,
    sections: structuredClone(defaultRenovationSections),
  });

  const [aiPrompt, setAiPrompt] = useState(
    "Full renovation for a 3-room condo, 980 sqft, modern luxury style with vinyl flooring, false ceiling, kitchen carpentry, wardrobe, painting, electrical rewiring, plumbing for kitchen and bathrooms, and glass shower screen.",
  );
  const [aiAssumptions, setAiAssumptions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedQuotationResponse["data"] | null>(null);

  const calculated = useMemo(
    () =>
      calculateRenovationQuote({
        sections: form.sections,
        discountAmount: form.discountAmount,
        gstRate: 0.09,
      }),
    [form.sections, form.discountAmount],
  );

  function updateTopLevel<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
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

  async function handleAiGenerate() {
    setAiLoading(true);
    setError("");
    setCreated(null);

    try {
      const response = await fetch("/api/ai/generate-renovation-quotation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          propertyType: form.propertyType,
          unitSizeSqft: form.unitSizeSqft,
          projectName: form.projectName,
        }),
      });

      const payload: AiDraftResponse = await response.json();

      if (!payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to generate AI draft");
      }

      setForm((current) => ({
        ...current,
        projectName: payload.data?.projectName || current.projectName,
        sections: payload.data?.sections || current.sections,
      }));

      setAiAssumptions(payload.data.assumptions);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate AI draft",
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    setCreated(null);

    try {
      const response = await fetch("/api/quotations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload: CreatedQuotationResponse = await response.json();

      if (!payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to create quotation");
      }

      setCreated(payload.data);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to create quotation",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
              Legacy Quotations
            </span>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Renovation Quotation Builder
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            AI Renovation Quotation Generator
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            This is the legacy quotation builder (non-project linked). For new project-linked quotations, open a project and use the Quotations tab.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50"
          >
            Dashboard
          </Link>
          <Link
            href="/projects"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50"
          >
            Projects
          </Link>
          <Link
            href="/quotation"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50"
          >
            Back to Legacy List
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-300 bg-white p-6 shadow-md">
          <h2 className="text-xl font-semibold text-neutral-950">
            AI Brief Generator
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Enter a renovation brief such as unit type, style, key works, and
            materials. The system will draft a quotation scope automatically.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <div>
              <Label text="AI Prompt" />
              <textarea
                className="mt-2 min-h-[140px] w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-neutral-900"
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
              />
            </div>

            <NumberBlock
              label="Unit Size (sqft)"
              value={form.unitSizeSqft}
              onChange={(value) => updateTopLevel("unitSizeSqft", value)}
            />

            <div>
              <Label text="Property Type" />
              <select
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-neutral-900"
                value={form.propertyType}
                onChange={(event) =>
                  updateTopLevel(
                    "propertyType",
                    event.target.value as FormState["propertyType"],
                  )
                }
              >
                <option value="HDB">HDB</option>
                <option value="CONDO">Condo</option>
                <option value="LANDED">Landed</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={aiLoading}
              className="rounded-xl bg-black px-4 py-3 font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiLoading ? "Generating..." : "Generate AI Scope"}
            </button>

            <button
              type="button"
              onClick={() => {
                setAiAssumptions([]);
                setForm((current) => ({
                  ...current,
                  sections: structuredClone(defaultRenovationSections),
                }));
              }}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-3 font-semibold text-neutral-900 transition hover:bg-neutral-50"
            >
              Reset to Default Template
            </button>
          </div>

          {aiAssumptions.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                AI Draft Assumptions
              </p>
              <div className="mt-3 space-y-2">
                {aiAssumptions.map((assumption) => (
                  <div
                    key={assumption}
                    className="rounded-lg bg-white px-3 py-2 text-sm text-amber-900"
                  >
                    {assumption}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-neutral-300 bg-white p-6 shadow-md">
              <h2 className="text-xl font-semibold text-neutral-950">
                Project & Client Details
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Required client information, project address, property type, and
                quotation metadata.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <InputBlock
                  label="Client Name"
                  value={form.clientName}
                  onChange={(value) => updateTopLevel("clientName", value)}
                />
                <InputBlock
                  label="Company"
                  value={form.companyName}
                  onChange={(value) => updateTopLevel("companyName", value)}
                />
                <InputBlock
                  label="Contact Person"
                  value={form.contactPerson}
                  onChange={(value) => updateTopLevel("contactPerson", value)}
                />
                <InputBlock
                  label="Contact Phone"
                  value={form.contactPhone}
                  onChange={(value) => updateTopLevel("contactPhone", value)}
                />
                <InputBlock
                  label="Contact Email"
                  value={form.contactEmail}
                  onChange={(value) => updateTopLevel("contactEmail", value)}
                  type="email"
                />
                <InputBlock
                  label="Project Name"
                  value={form.projectName}
                  onChange={(value) => updateTopLevel("projectName", value)}
                />
                <InputBlock
                  label="Project Address"
                  value={form.projectAddress1}
                  onChange={(value) => updateTopLevel("projectAddress1", value)}
                />
                <InputBlock
                  label="Address Line 2"
                  value={form.projectAddress2}
                  onChange={(value) => updateTopLevel("projectAddress2", value)}
                />
                <InputBlock
                  label="Postal Code"
                  value={form.projectPostalCode}
                  onChange={(value) =>
                    updateTopLevel("projectPostalCode", value)
                  }
                />

                <div>
                  <Label text="Property Type" />
                  <select
                    className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-neutral-900"
                    value={form.propertyType}
                    onChange={(event) =>
                      updateTopLevel(
                        "propertyType",
                        event.target.value as FormState["propertyType"],
                      )
                    }
                  >
                    <option value="HDB">HDB</option>
                    <option value="CONDO">Condo</option>
                    <option value="LANDED">Landed</option>
                    <option value="COMMERCIAL">Commercial</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <NumberBlock
                  label="Unit Size (sqft)"
                  value={form.unitSizeSqft}
                  onChange={(value) => updateTopLevel("unitSizeSqft", value)}
                />
                <InputBlock
                  label="Quotation Date"
                  value={form.quotationDate}
                  onChange={(value) => updateTopLevel("quotationDate", value)}
                  type="date"
                />
                <NumberBlock
                  label="Validity (days)"
                  value={form.validityDays}
                  onChange={(value) => updateTopLevel("validityDays", value)}
                />
                <NumberBlock
                  label="Discount Amount"
                  value={form.discountAmount}
                  onChange={(value) => updateTopLevel("discountAmount", value)}
                />
              </div>

              <div className="mt-4 grid gap-4">
                <TextAreaBlock
                  label="Payment Terms"
                  value={form.paymentTerms}
                  onChange={(value) => updateTopLevel("paymentTerms", value)}
                  rows={3}
                />
                <TextAreaBlock
                  label="Exclusions"
                  value={form.exclusions}
                  onChange={(value) => updateTopLevel("exclusions", value)}
                  rows={4}
                />
                <TextAreaBlock
                  label="Notes"
                  value={form.notes}
                  onChange={(value) => updateTopLevel("notes", value)}
                  rows={3}
                />
              </div>
            </section>

            <section className="space-y-6">
              {form.sections.map((section, sectionIndex) => {
                const sectionCalculated = calculateRenovationQuote({
                  sections: [section],
                  discountAmount: 0,
                  gstRate: 0,
                }).sections[0];

                return (
                  <div
                    key={`${section.category}-${sectionIndex}`}
                    className="rounded-2xl border border-neutral-300 bg-white p-6 shadow-md"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          {getCategoryLabel(section.category)}
                        </p>
                        <h2 className="mt-2 text-xl font-semibold text-neutral-950">
                          {section.title}
                        </h2>
                        <p className="mt-1 text-sm text-neutral-600">
                          {section.description || "No section description."}
                        </p>
                      </div>

                      <div className="rounded-xl bg-neutral-950 px-4 py-3 text-white">
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
                          Section Subtotal
                        </p>
                        <p className="mt-1 text-2xl font-semibold">
                          {formatCurrency(sectionCalculated.subtotal)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <InputBlock
                        label="Section Title"
                        value={section.title}
                        onChange={(value) =>
                          updateSection(sectionIndex, (current) => ({
                            ...current,
                            title: value,
                          }))
                        }
                      />
                      <InputBlock
                        label="Remarks"
                        value={section.remarks || ""}
                        onChange={(value) =>
                          updateSection(sectionIndex, (current) => ({
                            ...current,
                            remarks: value,
                          }))
                        }
                      />
                    </div>

                    <div className="mt-4">
                      <TextAreaBlock
                        label="Section Description"
                        value={section.description || ""}
                        onChange={(value) =>
                          updateSection(sectionIndex, (current) => ({
                            ...current,
                            description: value,
                          }))
                        }
                        rows={2}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-4">
                      <TogglePill
                        label="Included"
                        checked={section.isIncluded}
                        onChange={(checked) =>
                          updateSection(sectionIndex, (current) => ({
                            ...current,
                            isIncluded: checked,
                          }))
                        }
                      />
                      <TogglePill
                        label="Optional"
                        checked={section.isOptional}
                        onChange={(checked) =>
                          updateSection(sectionIndex, (current) => ({
                            ...current,
                            isOptional: checked,
                          }))
                        }
                      />
                    </div>

                    <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-300">
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
                            <th className="px-4 py-3 text-left font-semibold">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.lineItems.map((item, itemIndex) => {
                            const amount = item.isIncluded
                              ? item.quantity * item.unitPrice
                              : 0;

                            return (
                              <tr
                                key={`${section.category}-${itemIndex}`}
                                className="border-t border-neutral-200"
                              >
                                <td className="px-4 py-4 align-top">
                                  <input
                                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 outline-none focus:border-neutral-900"
                                    value={item.description}
                                    onChange={(event) =>
                                      updateLineItem(
                                        sectionIndex,
                                        itemIndex,
                                        (current) => ({
                                          ...current,
                                          description: event.target.value,
                                        }),
                                      )
                                    }
                                    placeholder="Line item description"
                                  />
                                  <textarea
                                    className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 outline-none focus:border-neutral-900"
                                    value={item.specification || ""}
                                    onChange={(event) =>
                                      updateLineItem(
                                        sectionIndex,
                                        itemIndex,
                                        (current) => ({
                                          ...current,
                                          specification: event.target.value,
                                        }),
                                      )
                                    }
                                    rows={2}
                                    placeholder="Specification"
                                  />
                                  <div className="mt-2 flex flex-wrap gap-3">
                                    <TogglePill
                                      label="Included"
                                      checked={item.isIncluded}
                                      onChange={(checked) =>
                                        updateLineItem(
                                          sectionIndex,
                                          itemIndex,
                                          (current) => ({
                                            ...current,
                                            isIncluded: checked,
                                          }),
                                        )
                                      }
                                    />
                                    <TogglePill
                                      label="Optional"
                                      checked={item.isOptional}
                                      onChange={(checked) =>
                                        updateLineItem(
                                          sectionIndex,
                                          itemIndex,
                                          (current) => ({
                                            ...current,
                                            isOptional: checked,
                                          }),
                                        )
                                      }
                                    />
                                  </div>
                                </td>

                                <td className="px-4 py-4 align-top">
                                  <input
                                    className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 outline-none focus:border-neutral-900"
                                    value={item.unit}
                                    onChange={(event) =>
                                      updateLineItem(
                                        sectionIndex,
                                        itemIndex,
                                        (current) => ({
                                          ...current,
                                          unit: event.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </td>

                                <td className="px-4 py-4 align-top">
                                  <input
                                    type="number"
                                    className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 outline-none focus:border-neutral-900"
                                    value={item.quantity}
                                    onChange={(event) =>
                                      updateLineItem(
                                        sectionIndex,
                                        itemIndex,
                                        (current) => ({
                                          ...current,
                                          quantity: Number(event.target.value),
                                        }),
                                      )
                                    }
                                  />
                                </td>

                                <td className="px-4 py-4 align-top">
                                  <input
                                    type="number"
                                    className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 outline-none focus:border-neutral-900"
                                    value={item.unitPrice}
                                    onChange={(event) =>
                                      updateLineItem(
                                        sectionIndex,
                                        itemIndex,
                                        (current) => ({
                                          ...current,
                                          unitPrice: Number(event.target.value),
                                        }),
                                      )
                                    }
                                  />
                                </td>

                                <td className="px-4 py-4 align-top font-semibold text-neutral-950">
                                  {formatCurrency(amount)}
                                </td>

                                <td className="px-4 py-4 align-top">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeLineItem(sectionIndex, itemIndex)
                                    }
                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
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

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => addLineItem(sectionIndex)}
                        className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50"
                      >
                        Add Line Item
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-neutral-300 bg-white p-6 shadow-md">
              <h2 className="text-lg font-semibold text-neutral-950">
                Quote Summary
              </h2>

              <div className="mt-5 grid gap-3">
                <SummaryRow label="Subtotal" value={calculated.subtotal} />
                <SummaryRow
                  label="Discount"
                  value={calculated.discountAmount}
                />
                <SummaryRow label="GST (9%)" value={calculated.gstAmount} />
                <SummaryRow
                  label="Total"
                  value={calculated.totalAmount}
                  strong
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="mt-6 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Saving Quotation..." : "Generate & Save Quotation"}
              </button>

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {created ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                  <p className="font-semibold">Quotation created successfully.</p>
                  <p className="mt-1">
                    Reference: {created.quoteReferenceNumber}
                  </p>
                  <p className="mt-1">
                    Total: {formatCurrency(Number(created.totalAmount))}
                  </p>
                  <Link
                    href={`/quotation/${created.id}`}
                    className="mt-3 inline-flex items-center rounded-lg bg-emerald-700 px-3 py-2 font-medium text-white transition hover:bg-emerald-800"
                  >
                    Open Quotation
                  </Link>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-neutral-300 bg-white p-6 shadow-md">
              <h2 className="text-lg font-semibold text-neutral-950">
                Included Scope Categories
              </h2>

              <div className="mt-4 flex flex-wrap gap-2">
                {form.sections
                  .filter((section) => section.isIncluded)
                  .map((section) => (
                    <span
                      key={section.category}
                      className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white"
                    >
                      {getCategoryLabel(section.category)}
                    </span>
                  ))}
              </div>
	            </section>
	          </aside>
	        </div>
	    </main>
	  );
	}

function Label({ text }: { text: string }) {
  return <label className="text-sm font-medium text-neutral-700">{text}</label>;
}

function InputBlock({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label text={label} />
      <input
        type={type}
        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-neutral-900"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NumberBlock({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label text={label} />
      <input
        type="number"
        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-neutral-900"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function TextAreaBlock({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <div>
      <Label text={label} />
      <textarea
        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-neutral-900"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
      />
    </div>
  );
}

function TogglePill({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-neutral-300"
      />
      {label}
    </label>
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
