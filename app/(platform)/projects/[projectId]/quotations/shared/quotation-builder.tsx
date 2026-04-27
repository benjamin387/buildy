"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  defaultRenovationSections,
  type BuilderLineItemInput,
  type BuilderSectionInput,
} from "@/lib/quotation-engine/renovation-default-sections";
import { computeProjectQuotationSummary } from "@/lib/quotation-engine/project-quotation-math";

type ItemMasterOption = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  sellPrice: number;
  costPrice: number;
  unitId: string | null;
  unit: { id: string; code: string; name: string } | null;
};

type PaymentTermInput = {
  title: string;
  percent: number | null;
  amount: number | null;
  triggerType: string;
  dueDays: number | null;
  sortOrder: number;
};

type RoomBoqTemplateItemOption = {
  id: string;
  itemMasterId: string | null;
  sku: string | null;
  description: string;
  category: UiSection["category"];
  unit: string;
  defaultQuantity: number;
  defaultUnitPrice: number;
  defaultCostPrice: number;
  sortOrder: number;
  isOptional: boolean;
  itemMaster?: { id: string; sku: string; unitId: string | null; unit?: { code: string } | null } | null;
};

type RoomTemplateOption = {
  id: string;
  roomCode: string;
  name: string;
  roomType: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  boqItems: RoomBoqTemplateItemOption[];
};

type DesignPackageOption = {
  id: string;
  packageCode: string;
  name: string;
  propertyType: string;
  designStyle: string | null;
  isActive: boolean;
  rooms: RoomTemplateOption[];
};

type UiLineItem = BuilderLineItemInput & {
  itemMasterId?: string | null;
  unitOfMeasureId?: string | null;
};

type UiSection = Omit<BuilderSectionInput, "lineItems"> & {
  lineItems: UiLineItem[];
};

type FormState = {
  issueDate: string;
  validityDays: number;
  notes: string;
  exclusions: string;
  discountAmount: number;
  sections: UiSection[];
  paymentTermsV2: PaymentTermInput[];
};

type CreatedQuotationResponse = {
  success: boolean;
  data?: { id: string };
  error?: string;
};

type SimpleResponse = { success: boolean; error?: string };
type UpdateQuotationResponse = { success: boolean; data?: { id: string }; error?: string };

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

function createBlankLineItem(): UiLineItem {
  return {
    sku: "",
    itemMasterId: null,
    unitOfMeasureId: null,
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

function createBlankSection(): UiSection {
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

function numberFromInput(value: string, fallback: number): number {
  const n = value === "" ? NaN : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function defaultPaymentTerms(): PaymentTermInput[] {
  return [
    {
      title: "50% project start",
      percent: 50,
      amount: null,
      triggerType: "PROJECT_START",
      dueDays: 0,
      sortOrder: 0,
    },
    {
      title: "50% project handover",
      percent: 50,
      amount: null,
      triggerType: "PROJECT_HANDOVER",
      dueDays: 0,
      sortOrder: 1,
    },
  ];
}

function derivedPaymentAmount(params: { percent: number; subtotal: number }): number {
  const raw = (params.percent / 100) * params.subtotal;
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

function stripForCompute(sections: UiSection[]): BuilderSectionInput[] {
  return sections.map((section) => ({
    category: section.category,
    title: section.title,
    description: section.description,
    isIncluded: section.isIncluded,
    isOptional: section.isOptional,
    remarks: section.remarks,
    lineItems: section.lineItems.map((item) => ({
      sku: item.sku,
      description: item.description,
      specification: item.specification,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      costPrice: item.costPrice,
      remarks: item.remarks,
      itemType: item.itemType,
      isIncluded: item.isIncluded,
      isOptional: item.isOptional,
    })),
  }));
}

export function QuotationBuilder(props: {
  mode: "create" | "edit";
  projectId: string;
  projectName: string;
  clientName: string;
  gstRate: number;
  itemMasters: ItemMasterOption[];
  designPackages: DesignPackageOption[];
  quotationId?: string;
  initialState?: FormState;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (props.initialState) return props.initialState;
    return {
      issueDate: todayIsoDate(),
      validityDays: 14,
      notes: "",
      exclusions: "",
      discountAmount: 0,
      sections: structuredClone(defaultRenovationSections) as unknown as UiSection[],
      paymentTermsV2: defaultPaymentTerms(),
    };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [templateOpen, setTemplateOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string>(() => props.designPackages[0]?.id ?? "");
  const [selectedRoomId, setSelectedRoomId] = useState<string>(() => props.designPackages[0]?.rooms[0]?.id ?? "");
  const [roomMultiplier, setRoomMultiplier] = useState<number>(1);

  const deferredSections = useDeferredValue(form.sections);
  const deferredDiscount = useDeferredValue(form.discountAmount);

  const summary = useMemo(() => {
    return computeProjectQuotationSummary({
      sections: stripForCompute(deferredSections),
      discountAmount: deferredDiscount,
      gstRate: props.gstRate,
    });
  }, [deferredSections, deferredDiscount, props.gstRate]);

  function updateTopLevel<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSection(sectionIndex: number, updater: (section: UiSection) => UiSection) {
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
    updater: (item: UiLineItem) => UiLineItem,
  ) {
    updateSection(sectionIndex, (section) => ({
      ...section,
      lineItems: section.lineItems.map((item, index) => (index === itemIndex ? updater(item) : item)),
    }));
  }

  function addSection() {
    setForm((current) => ({ ...current, sections: [...current.sections, createBlankSection()] }));
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

  function applyItemMaster(sectionIndex: number, itemIndex: number, itemMasterId: string) {
    const master = props.itemMasters.find((m) => m.id === itemMasterId);
    if (!master) return;

    updateLineItem(sectionIndex, itemIndex, (item) => ({
      ...item,
      itemMasterId: master.id,
      unitOfMeasureId: master.unitId ?? null,
      sku: master.sku,
      description: master.description?.trim() ? `${master.name} - ${master.description}` : master.name,
      unit: master.unit?.code ?? item.unit,
      unitPrice: master.sellPrice,
      costPrice: master.costPrice,
    }));
  }

  function addPaymentTerm() {
    setForm((current) => ({
      ...current,
      paymentTermsV2: [
        ...current.paymentTermsV2,
        {
          title: "New term",
          percent: null,
          amount: null,
          triggerType: "CUSTOM",
          dueDays: 0,
          sortOrder: current.paymentTermsV2.length,
        },
      ],
    }));
  }

  function removePaymentTerm(index: number) {
    setForm((current) => {
      const remaining =
        current.paymentTermsV2.length === 1
          ? defaultPaymentTerms()
          : current.paymentTermsV2.filter((_, i) => i !== index);
      return {
        ...current,
        paymentTermsV2: remaining.map((term, i) => ({ ...term, sortOrder: i })),
      };
    });
  }

  function updatePaymentTerm(index: number, updater: (term: PaymentTermInput) => PaymentTermInput) {
    setForm((current) => ({
      ...current,
      paymentTermsV2: current.paymentTermsV2.map((term, i) =>
        i === index ? { ...updater(term), sortOrder: i } : term,
      ),
    }));
  }

  function insertRoomTemplateAsSection(input: { packageId: string; roomId: string; multiplier: number }) {
    const pkg = props.designPackages.find((p) => p.id === input.packageId);
    if (!pkg) return;
    const room = pkg.rooms.find((r) => r.id === input.roomId);
    if (!room) return;

    const multiplier = Number.isFinite(input.multiplier) ? Math.max(0, input.multiplier) : 1;
    const lineItems: UiLineItem[] =
      room.boqItems.length > 0
        ? room.boqItems.map((t) => ({
            sku: (t.sku ?? t.itemMaster?.sku ?? "").trim(),
            itemMasterId: t.itemMasterId ?? t.itemMaster?.id ?? null,
            unitOfMeasureId: t.itemMaster?.unitId ?? null,
            description: t.description,
            specification: "",
            unit: (t.unit || t.itemMaster?.unit?.code || "lot").trim(),
            quantity: clampNonNegative(t.defaultQuantity * multiplier),
            unitPrice: clampNonNegative(t.defaultUnitPrice),
            costPrice: clampNonNegative(t.defaultCostPrice),
            remarks: t.category !== "OTHER" ? `Template category: ${t.category}` : "",
            itemType: "SUPPLY_AND_INSTALL",
            isIncluded: !t.isOptional,
            isOptional: t.isOptional,
          }))
        : [createBlankLineItem()];

    const nextSection: UiSection = {
      category: "OTHER",
      title: room.name,
      description: room.description ?? "",
      isIncluded: true,
      isOptional: false,
      remarks: `Added from template: ${pkg.packageCode} / ${room.roomCode}`,
      lineItems,
    };

    setForm((current) => ({ ...current, sections: [...current.sections, nextSection] }));
  }

  async function submitCreateOrUpdate() {
    setLoading(true);
    setError("");

    try {
      const url =
        props.mode === "create"
          ? `/api/projects/${props.projectId}/quotations`
          : `/api/projects/${props.projectId}/quotations/${props.quotationId}`;
      const method = props.mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (props.mode === "create") {
        const payload: CreatedQuotationResponse = await response.json();
        if (!payload.success || !payload.data) {
          throw new Error(payload.error || "Failed to create quotation");
        }
        window.location.assign(`/projects/${props.projectId}/quotations/${payload.data.id}`);
      } else {
        const payload: UpdateQuotationResponse = await response.json();
        if (!payload.success) throw new Error(payload.error || "Failed to update quotation");
        const nextId = payload.data?.id ?? props.quotationId;
        window.location.assign(`/projects/${props.projectId}/quotations/${nextId}`);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save quotation");
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
                href={`/projects/${props.projectId}/quotations`}
                className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
              >
                Back
              </Link>
              <span className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                {props.mode === "create" ? "Draft" : "Edit"}
              </span>
            </div>

            <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Project Quotation
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
              {props.projectName}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
              Client: {props.clientName}. Build your BOQ by section, enter SKU, selling price, and
              cost price to get live margin.
            </p>
          </div>

          <div className="grid gap-2 rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
            <div className="flex items-baseline justify-between gap-6">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Net Revenue</p>
              <p className="text-xl font-semibold">{formatCurrency(summary.revenueNet)}</p>
            </div>
            <div className="flex items-baseline justify-between gap-6">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Est Cost</p>
              <p className="text-xl font-semibold">{formatCurrency(summary.costSubtotal)}</p>
            </div>
            <div className="flex items-baseline justify-between gap-6">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Profit</p>
              <p className="text-xl font-semibold">{formatCurrency(summary.profitAmount)}</p>
            </div>
            <p className="text-xs text-neutral-300">Margin {formatPct(summary.marginPercent)}</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm lg:grid-cols-4">
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
            <span className="font-medium text-neutral-800">Discount</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.discountAmount}
              onChange={(e) =>
                updateTopLevel(
                  "discountAmount",
                  clampNonNegative(numberFromInput(e.target.value, 0)),
                )
              }
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
            />
          </label>
          <div className="flex items-end justify-end">
            <button
              type="button"
              onClick={submitCreateOrUpdate}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving..." : props.mode === "create" ? "Create Quotation" : "Save Changes"}
            </button>
          </div>

          <label className="lg:col-span-2 grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => updateTopLevel("notes", e.target.value)}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Notes shown on quotation (optional)"
            />
          </label>
          <label className="lg:col-span-2 grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Exclusions</span>
            <textarea
              rows={3}
              value={form.exclusions}
              onChange={(e) => updateTopLevel("exclusions", e.target.value)}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Exclusions (optional)"
            />
          </label>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-950">Payment Terms</p>
              <p className="mt-1 text-sm text-neutral-600">
                Stage payments by percentage or amount, with a trigger and due-days offset.
              </p>
            </div>
            <button
              type="button"
              onClick={addPaymentTerm}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Add Term
            </button>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Label</th>
                  <th className="px-3 py-3 text-right font-semibold">%</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                  <th className="px-3 py-3 text-left font-semibold">Trigger</th>
                  <th className="px-3 py-3 text-right font-semibold">Due Days</th>
                  <th className="px-3 py-3 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {form.paymentTermsV2.map((term, index) => (
                  <tr key={`${term.title}-${index}`} className="border-t border-neutral-200">
                    <td className="px-3 py-3">
                      <input
                        value={term.title}
                        onChange={(e) =>
                          updatePaymentTerm(index, (t) => ({ ...t, title: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={term.percent ?? ""}
                        onChange={(e) => {
                          const v =
                            e.target.value === ""
                              ? null
                              : clampNonNegative(numberFromInput(e.target.value, 0));
                          updatePaymentTerm(index, (t) => ({
                            ...t,
                            percent: Number.isFinite(v as number) ? v : null,
                            amount: null,
                          }));
                        }}
                        disabled={term.amount !== null}
                        className="h-10 w-24 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="grid gap-1">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={term.amount ?? ""}
                          onChange={(e) => {
                            const v =
                              e.target.value === ""
                                ? null
                                : clampNonNegative(numberFromInput(e.target.value, 0));
                            updatePaymentTerm(index, (t) => ({
                              ...t,
                              amount: Number.isFinite(v as number) ? v : null,
                              percent: null,
                            }));
                          }}
                          disabled={term.percent !== null}
                          className="h-10 w-32 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2 disabled:bg-neutral-100 disabled:text-neutral-500"
                        />
                        {term.percent !== null ? (
                          <span className="text-xs text-neutral-500">
                            Auto:{" "}
                            {formatCurrency(
                              derivedPaymentAmount({
                                percent: term.percent,
                                subtotal: summary.subtotal,
                              }),
                            )}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={term.triggerType}
                        onChange={(e) =>
                          updatePaymentTerm(index, (t) => ({ ...t, triggerType: e.target.value }))
                        }
                        className="h-10 w-56 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                      >
                        <option value="PROJECT_START">PROJECT_START</option>
                        <option value="PROJECT_HANDOVER">PROJECT_HANDOVER</option>
                        <option value="MILESTONE">MILESTONE</option>
                        <option value="CUSTOM">CUSTOM</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        value={term.dueDays ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value === "" ? null : Number(e.target.value);
                          const v = raw === null || !Number.isFinite(raw) ? null : Math.max(0, Math.floor(raw));
                          updatePaymentTerm(index, (t) => ({
                            ...t,
                            dueDays: v,
                          }));
                        }}
                        className="h-10 w-24 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => removePaymentTerm(index)}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-950">BOQ Sections</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTemplateOpen((v) => !v)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
              >
                Add from Room Template
              </button>
              <button
                type="button"
                onClick={addSection}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
              >
                Add Section
              </button>
            </div>
          </div>

          {templateOpen ? (
            <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-950">Insert Room Template</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    Select a package + room template. The system will insert a new BOQ section and copy template items.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTemplateOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                >
                  Close
                </button>
              </div>

              {props.designPackages.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600">
                  No design packages available. Create templates in{" "}
                  <Link href="/design-packages" className="font-semibold text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-500">
                    Design Packages
                  </Link>
                  .
                </div>
              ) : (
                <div className="mt-5 grid gap-4 lg:grid-cols-12">
                  <label className="grid gap-2 text-sm lg:col-span-5">
                    <span className="font-medium text-neutral-800">Design Package</span>
                    <select
                      value={selectedPackageId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedPackageId(id);
                        const pkg = props.designPackages.find((p) => p.id === id);
                        setSelectedRoomId(pkg?.rooms[0]?.id ?? "");
                      }}
                      className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                    >
                      {props.designPackages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.packageCode} · {p.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm lg:col-span-5">
                    <span className="font-medium text-neutral-800">Room Template</span>
                    <select
                      value={selectedRoomId}
                      onChange={(e) => setSelectedRoomId(e.target.value)}
                      className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                    >
                      {(props.designPackages.find((p) => p.id === selectedPackageId)?.rooms ?? []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.roomCode}) · {r.boqItems.length} items
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm lg:col-span-2">
                    <span className="font-medium text-neutral-800">Multiplier</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={roomMultiplier}
                      onChange={(e) => setRoomMultiplier(numberFromInput(e.target.value, 1))}
                      className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                    />
                  </label>

                  <div className="flex justify-end lg:col-span-12">
                    <button
                      type="button"
                      onClick={() => {
                        insertRoomTemplateAsSection({
                          packageId: selectedPackageId,
                          roomId: selectedRoomId,
                          multiplier: roomMultiplier,
                        });
                        setTemplateOpen(false);
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
                    >
                      Insert as New Section
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {form.sections.map((section, sectionIndex) => {
            const computedSection = summary.sections[sectionIndex];

            return (
              <section
                key={`${section.title}-${sectionIndex}`}
                className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-2 text-sm sm:col-span-2">
                        <span className="font-medium text-neutral-800">Section Title</span>
                        <input
                          value={section.title}
                          onChange={(e) =>
                            updateSection(sectionIndex, (s) => ({ ...s, title: e.target.value }))
                          }
                          className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                        />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-neutral-800">Category</span>
                        <select
                          value={section.category}
                          onChange={(e) =>
                            updateSection(sectionIndex, (s) => ({
                              ...s,
                              category: e.target.value as UiSection["category"],
                            }))
                          }
                          className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                        >
                          <option value="CARPENTRY">CARPENTRY</option>
                          <option value="ELECTRICAL_WORKS">ELECTRICAL_WORKS</option>
                          <option value="PLUMBING_WORKS">PLUMBING_WORKS</option>
                          <option value="FLOORING">FLOORING</option>
                          <option value="PAINTING_WORKS">PAINTING_WORKS</option>
                          <option value="CEILING_PARTITION">CEILING_PARTITION</option>
                          <option value="GLASS_ALUMINIUM">GLASS_ALUMINIUM</option>
                          <option value="MASONRY_WORKS">MASONRY_WORKS</option>
                          <option value="HACKING_DEMOLITION">HACKING_DEMOLITION</option>
                          <option value="CLEANING_DISPOSAL">CLEANING_DISPOSAL</option>
                          <option value="OTHER">OTHER</option>
                        </select>
                      </label>
                    </div>

                    <label className="grid gap-2 text-sm">
                      <span className="font-medium text-neutral-800">Description</span>
                      <textarea
                        rows={2}
                        value={section.description}
                        onChange={(e) =>
                          updateSection(sectionIndex, (s) => ({ ...s, description: e.target.value }))
                        }
                        className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-sm">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
                      Section Subtotal
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {formatCurrency(computedSection?.subtotal ?? 0)}
                    </p>
                    <p className="mt-2 text-xs text-neutral-300">
                      Profit {formatCurrency(computedSection?.profit ?? 0)} · Margin{" "}
                      {formatPct(computedSection?.marginPercent ?? null)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-[1320px] w-full text-sm">
                    <thead className="bg-neutral-100 text-neutral-800">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold">Item Master</th>
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
                        <th className="px-3 py-3 text-left font-semibold">Include</th>
                        <th className="px-3 py-3 text-left font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.lineItems.map((item, itemIndex) => {
                        const computedItem = computedSection?.lineItems[itemIndex];
                        return (
                          <tr key={`${item.description}-${itemIndex}`} className="border-t border-neutral-200">
                            <td className="px-3 py-3">
                              <select
                                value={item.itemMasterId ?? ""}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  if (!id) {
                                    updateLineItem(sectionIndex, itemIndex, (li) => ({
                                      ...li,
                                      itemMasterId: null,
                                      unitOfMeasureId: null,
                                    }));
                                    return;
                                  }
                                  applyItemMaster(sectionIndex, itemIndex, id);
                                }}
                                className="h-10 w-64 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                              >
                                <option value="">(manual)</option>
                                {props.itemMasters.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.sku} · {m.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={item.sku}
                                onChange={(e) => updateLineItem(sectionIndex, itemIndex, (li) => ({ ...li, sku: e.target.value }))}
                                className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={item.description}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (li) => ({ ...li, description: e.target.value }))
                                }
                                className="h-10 w-full min-w-[360px] rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                value={item.unit}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (li) => ({ ...li, unit: e.target.value }))
                                }
                                className="h-10 w-20 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (li) => ({
                                    ...li,
                                    quantity: clampNonNegative(numberFromInput(e.target.value, 0)),
                                  }))
                                }
                                className="h-10 w-24 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (li) => ({
                                    ...li,
                                    unitPrice: clampNonNegative(numberFromInput(e.target.value, 0)),
                                  }))
                                }
                                className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.costPrice}
                                onChange={(e) =>
                                  updateLineItem(sectionIndex, itemIndex, (li) => ({
                                    ...li,
                                    costPrice: clampNonNegative(numberFromInput(e.target.value, 0)),
                                  }))
                                }
                                className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
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
                              <div className="flex items-center gap-3">
                                <label className="inline-flex items-center gap-2 text-sm text-neutral-800">
                                  <input
                                    type="checkbox"
                                    checked={item.isIncluded}
                                    onChange={(e) =>
                                      updateLineItem(sectionIndex, itemIndex, (li) => ({
                                        ...li,
                                        isIncluded: e.target.checked,
                                      }))
                                    }
                                    className="h-4 w-4 rounded border-neutral-300 text-neutral-950"
                                  />
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
                                    In
                                  </span>
                                </label>
                                {item.isOptional ? (
                                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                                    Optional
                                  </span>
                                ) : null}
                              </div>
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

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => addLineItem(sectionIndex)}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
                  >
                    Add Item
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(sectionIndex)}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                  >
                    Remove Section
                  </button>
                </div>
              </section>
            );
          })}
        </section>

        <section className="grid gap-2 rounded-2xl border border-neutral-200 bg-white p-6 text-sm shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Subtotal</span>
            <span className="font-medium text-neutral-900">{formatCurrency(summary.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Discount</span>
            <span className="font-medium text-neutral-900">{formatCurrency(summary.discountAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Net Revenue</span>
            <span className="font-medium text-neutral-900">{formatCurrency(summary.revenueNet)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">GST</span>
            <span className="font-medium text-neutral-900">{formatCurrency(summary.gstAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Estimated Cost</span>
            <span className="font-medium text-neutral-900">{formatCurrency(summary.costSubtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Profit</span>
            <span className="font-medium text-neutral-900">{formatCurrency(summary.profitAmount)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
            <span className="font-semibold text-neutral-900">Total</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(summary.totalAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Margin</span>
            <span className="font-semibold text-neutral-900">{formatPct(summary.marginPercent)}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
