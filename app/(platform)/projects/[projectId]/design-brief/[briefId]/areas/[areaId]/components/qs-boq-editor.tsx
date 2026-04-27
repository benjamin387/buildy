"use client";

import { useMemo, useState } from "react";

export type QsRow = {
  id: string | null;
  description: string;
  unit: string;
  quantity: number;
  recommendedSellingUnitPrice: number;
  estimatedCostUnitPrice: number;
  isEditable: boolean;
  sortOrder: number;
  quotationItemId: string | null;
  selected: boolean;
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function roundCurrency(value: number): number {
  return round(value, 2);
}

function pct(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return round((numerator / denominator) * 100, 4);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
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

export function QsBoqEditor(props: {
  projectId: string;
  briefId: string;
  areaId: string;
  initialRows: QsRow[];
  saveAction: (formData: FormData) => void;
  pushAction: (formData: FormData) => void;
}) {
  const [rows, setRows] = useState<QsRow[]>(() => props.initialRows);

  const selectedCount = useMemo(() => rows.filter((r) => r.selected && !r.quotationItemId).length, [rows]);

  const computed = useMemo(() => {
    const line = rows.map((r) => {
      const qty = clampNonNegative(r.quantity);
      const sell = clampNonNegative(r.recommendedSellingUnitPrice);
      const cost = clampNonNegative(r.estimatedCostUnitPrice);
      const sellingTotal = roundCurrency(qty * sell);
      const costTotal = roundCurrency(qty * cost);
      const profit = roundCurrency(sellingTotal - costTotal);
      const marginPercent = pct(profit, sellingTotal);
      return { sellingTotal, costTotal, profit, marginPercent };
    });

    const sellingTotal = roundCurrency(line.reduce((sum, li) => sum + li.sellingTotal, 0));
    const costTotal = roundCurrency(line.reduce((sum, li) => sum + li.costTotal, 0));
    const profit = roundCurrency(sellingTotal - costTotal);
    const marginPercent = pct(profit, sellingTotal);

    return { line, totals: { sellingTotal, costTotal, profit, marginPercent } };
  }, [rows]);

  const rowsJson = useMemo(() => {
    return JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        description: r.description,
        unit: r.unit,
        quantity: clampNonNegative(r.quantity),
        recommendedSellingUnitPrice: clampNonNegative(r.recommendedSellingUnitPrice),
        estimatedCostUnitPrice: clampNonNegative(r.estimatedCostUnitPrice),
        isEditable: r.isEditable,
        sortOrder: r.sortOrder,
      })),
    );
  }, [rows]);

  const selectedIdsJson = useMemo(() => {
    return JSON.stringify(rows.filter((r) => r.selected).map((r) => r.id).filter((id): id is string => Boolean(id)));
  }, [rows]);

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: null,
        description: "",
        unit: "lot",
        quantity: 0,
        recommendedSellingUnitPrice: 0,
        estimatedCostUnitPrice: 0,
        isEditable: true,
        sortOrder: current.length,
        quotationItemId: null,
        selected: true,
      },
    ]);
  }

  function updateRow(index: number, updater: (r: QsRow) => QsRow) {
    setRows((current) => current.map((r, i) => (i === index ? updater(r) : r)));
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index).map((r, i) => ({ ...r, sortOrder: i })));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-neutral-950">QS BOQ Draft</p>
          <p className="mt-1 text-sm text-neutral-600">
            Excel-like draft items with derived totals. Save before pushing to quotation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Add Row
          </button>
          <form action={props.saveAction}>
            <input type="hidden" name="projectId" value={props.projectId} />
            <input type="hidden" name="briefId" value={props.briefId} />
            <input type="hidden" name="areaId" value={props.areaId} />
            <input type="hidden" name="rowsJson" value={rowsJson} />
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Save QS Draft
            </button>
          </form>
          <form action={props.pushAction}>
            <input type="hidden" name="projectId" value={props.projectId} />
            <input type="hidden" name="briefId" value={props.briefId} />
            <input type="hidden" name="areaId" value={props.areaId} />
            <input type="hidden" name="selectedIdsJson" value={selectedIdsJson} />
            <button
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? "Select at least one unlocked row to push." : undefined}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              Push Selected to Quotation{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
          </form>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-neutral-100 text-neutral-800">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">Push</th>
              <th className="px-3 py-3 text-left font-semibold">Description</th>
              <th className="px-3 py-3 text-left font-semibold">Unit</th>
              <th className="px-3 py-3 text-right font-semibold">Qty</th>
              <th className="px-3 py-3 text-right font-semibold">Sell Unit</th>
              <th className="px-3 py-3 text-right font-semibold">Cost Unit</th>
              <th className="px-3 py-3 text-right font-semibold">Sell Total</th>
              <th className="px-3 py-3 text-right font-semibold">Cost Total</th>
              <th className="px-3 py-3 text-right font-semibold">Profit</th>
              <th className="px-3 py-3 text-right font-semibold">Margin</th>
              <th className="px-3 py-3 text-left font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-sm text-neutral-600" colSpan={11}>
                  No QS rows yet. Add a row to start drafting.
                </td>
              </tr>
            ) : (
              rows.map((r, index) => {
                const c = computed.line[index];
                const isLocked = Boolean(r.quotationItemId);
                return (
                  <tr key={`${r.id ?? "new"}-${index}`} className="border-t border-neutral-200">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => updateRow(index, (row) => ({ ...row, selected: e.target.checked }))}
                        disabled={isLocked}
                        className="h-4 w-4 rounded border-neutral-300 text-neutral-950"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={r.description}
                        onChange={(e) => updateRow(index, (row) => ({ ...row, description: e.target.value }))}
                        disabled={!r.isEditable || isLocked}
                        className="h-10 w-[420px] max-w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2 disabled:bg-neutral-50"
                        placeholder="Full work description"
                      />
                      {isLocked ? (
                        <p className="mt-1 text-xs text-neutral-500">Locked: already pushed to quotation.</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={r.unit}
                        onChange={(e) => updateRow(index, (row) => ({ ...row, unit: e.target.value }))}
                        disabled={!r.isEditable || isLocked}
                        className="h-10 w-20 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2 disabled:bg-neutral-50"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.quantity}
                        onChange={(e) =>
                          updateRow(index, (row) => ({
                            ...row,
                            quantity: clampNonNegative(numberFromInput(e.target.value, 0)),
                          }))
                        }
                        disabled={!r.isEditable || isLocked}
                        className="h-10 w-24 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2 disabled:bg-neutral-50"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.recommendedSellingUnitPrice}
                        onChange={(e) =>
                          updateRow(index, (row) => ({
                            ...row,
                            recommendedSellingUnitPrice: clampNonNegative(numberFromInput(e.target.value, 0)),
                          }))
                        }
                        disabled={!r.isEditable || isLocked}
                        className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2 disabled:bg-neutral-50"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.estimatedCostUnitPrice}
                        onChange={(e) =>
                          updateRow(index, (row) => ({
                            ...row,
                            estimatedCostUnitPrice: clampNonNegative(numberFromInput(e.target.value, 0)),
                          }))
                        }
                        disabled={!r.isEditable || isLocked}
                        className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2 disabled:bg-neutral-50"
                      />
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-neutral-950">{formatCurrency(c?.sellingTotal ?? 0)}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">{formatCurrency(c?.costTotal ?? 0)}</td>
                    <td className="px-3 py-3 text-right font-medium text-neutral-950">{formatCurrency(c?.profit ?? 0)}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">{(c?.marginPercent ?? 0).toFixed(1)}%</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-60"
                        disabled={isLocked}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 bg-neutral-50">
              <td className="px-3 py-3" colSpan={6}>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Totals
                </span>
              </td>
              <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                {formatCurrency(computed.totals.sellingTotal)}
              </td>
              <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                {formatCurrency(computed.totals.costTotal)}
              </td>
              <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                {formatCurrency(computed.totals.profit)}
              </td>
              <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                {computed.totals.marginPercent.toFixed(1)}%
              </td>
              <td className="px-3 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-xs text-neutral-500">
        Server recalculation runs on save. Margin is computed as <span className="font-semibold text-neutral-700">profit / selling total</span>.
      </div>
    </div>
  );
}
