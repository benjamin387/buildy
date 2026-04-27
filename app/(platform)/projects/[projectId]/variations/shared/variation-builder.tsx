"use client";

import { useMemo, useState } from "react";
import { computeVariationTotals, type VariationItemInput } from "@/lib/variation-orders/engine";

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

type UiItem = Omit<VariationItemInput, "sku" | "itemId"> & {
  key: string;
  itemId: string | null;
  sku: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function makeKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function numberFromInput(value: string, fallback: number): number {
  const n = value === "" ? NaN : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function blankItem(sortOrder: number): UiItem {
  return {
    key: makeKey(),
    itemId: null,
    sku: "",
    description: "",
    unit: "lot",
    quantity: 0,
    unitPrice: 0,
    costPrice: 0,
    sortOrder,
  };
}

export function VariationBuilder(props: {
  gstRate: number;
  itemMasters: ItemMasterOption[];
  initialItems?: Array<{
    itemId?: string | null;
    sku?: string | null;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    sortOrder: number;
  }>;
}) {
  const [items, setItems] = useState<UiItem[]>(() => {
    const init = props.initialItems?.length
      ? props.initialItems
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((i) => ({
            key: makeKey(),
            itemId: i.itemId ?? null,
            sku: i.sku ?? "",
            description: i.description,
            unit: i.unit || "lot",
            quantity: clampNonNegative(i.quantity),
            unitPrice: clampNonNegative(i.unitPrice),
            costPrice: clampNonNegative(i.costPrice),
            sortOrder: i.sortOrder,
          }))
      : [blankItem(0)];
    return init;
  });

  const payload = useMemo(() => {
    return items.map((i) => ({
      itemId: i.itemId ?? null,
      sku: i.sku?.trim() ? i.sku.trim() : null,
      description: i.description.trim() || "(no description)",
      unit: i.unit || "lot",
      quantity: clampNonNegative(i.quantity),
      unitPrice: clampNonNegative(i.unitPrice),
      costPrice: clampNonNegative(i.costPrice),
      sortOrder: i.sortOrder,
    }));
  }, [items]);

  const computed = useMemo(() => computeVariationTotals({ items: payload, gstRate: props.gstRate }), [payload, props.gstRate]);

  function updateItem(key: string, patch: Partial<UiItem>) {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    );
  }

  function addItem() {
    setItems((prev) => {
      const nextSort = prev.length ? Math.max(...prev.map((p) => p.sortOrder)) + 1 : 0;
      return [...prev, blankItem(nextSort)];
    });
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.key !== key);
      return next.length ? next : [blankItem(0)];
    });
  }

  function onSelectItemMaster(key: string, id: string) {
    const selected = props.itemMasters.find((m) => m.id === id);
    if (!selected) return;
    updateItem(key, {
      itemId: selected.id,
      sku: selected.sku,
      description: selected.description ?? selected.name,
      unit: selected.unit?.code ?? "lot",
      unitPrice: selected.sellPrice,
      costPrice: selected.costPrice,
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-200 px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Variation Items (BOQ)</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Add and price the scope changes. Totals recalculate live and will be recalculated on save.
            </p>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Add Item
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <input type="hidden" name="itemsJson" value={JSON.stringify(payload)} />

        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">Item</th>
                <th className="px-3 py-3 text-left font-semibold">SKU</th>
                <th className="px-3 py-3 text-left font-semibold">Description</th>
                <th className="px-3 py-3 text-left font-semibold">Unit</th>
                <th className="px-3 py-3 text-right font-semibold">Qty</th>
                <th className="px-3 py-3 text-right font-semibold">Unit Price</th>
                <th className="px-3 py-3 text-right font-semibold">Line Total</th>
                <th className="px-3 py-3 text-right font-semibold">Cost Price</th>
                <th className="px-3 py-3 text-right font-semibold">Cost Total</th>
                <th className="px-3 py-3 text-right font-semibold">Profit</th>
                <th className="px-3 py-3 text-right font-semibold">Margin %</th>
                <th className="px-3 py-3 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, idx) => {
                const computedRow = computed.items[idx];
                return (
                  <tr key={row.key} className="border-t border-neutral-200 bg-white">
                    <td className="px-3 py-2">
                      <select
                        value={row.itemId ?? ""}
                        onChange={(e) => onSelectItemMaster(row.key, e.target.value)}
                        className="h-10 w-44 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                      >
                        <option value="">(Manual)</option>
                        {props.itemMasters.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.sku} · {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.sku}
                        onChange={(e) => updateItem(row.key, { sku: e.target.value })}
                        className="h-10 w-32 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                        placeholder="SKU"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.description}
                        onChange={(e) => updateItem(row.key, { description: e.target.value })}
                        className="h-10 w-[420px] rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                        placeholder="Work description"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.unit}
                        onChange={(e) => updateItem(row.key, { unit: e.target.value })}
                        className="h-10 w-20 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        value={row.quantity}
                        onChange={(e) => updateItem(row.key, { quantity: numberFromInput(e.target.value, row.quantity) })}
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-10 w-24 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        value={row.unitPrice}
                        onChange={(e) => updateItem(row.key, { unitPrice: numberFromInput(e.target.value, row.unitPrice) })}
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-neutral-900">
                      {formatCurrency(computedRow?.totalPrice ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        value={row.costPrice}
                        onChange={(e) => updateItem(row.key, { costPrice: numberFromInput(e.target.value, row.costPrice) })}
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-neutral-900">
                      {formatCurrency(computedRow?.totalCost ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-neutral-900">
                      {formatCurrency(computedRow?.profitAmount ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-700">
                      {(computedRow?.marginPercent ?? 0).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeItem(row.key)}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
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

        <section className="grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Subtotal (net)</span>
              <span className="font-semibold text-neutral-900">{formatCurrency(computed.totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Estimated Cost</span>
              <span className="font-semibold text-neutral-900">{formatCurrency(computed.totals.costSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Profit</span>
              <span className="font-semibold text-neutral-900">{formatCurrency(computed.totals.profitAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Margin</span>
              <span className="font-semibold text-neutral-900">{computed.totals.marginPercent.toFixed(2)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">GST</span>
              <span className="font-semibold text-neutral-900">{formatCurrency(computed.totals.gstAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Total (gross)</span>
              <span className="font-semibold text-neutral-900">{formatCurrency(computed.totals.totalAmount)}</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
