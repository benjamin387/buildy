"use client";

import { useMemo, useState } from "react";

type Line = {
  id?: string | null;
  itemId?: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  sortOrder: number;
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function SupplierBillLinesEditor(props: {
  name: string;
  initialLines?: Line[];
  gstRate: number;
  isGstRegistered: boolean;
}) {
  const [lines, setLines] = useState<Line[]>(
    props.initialLines?.length
      ? props.initialLines
      : [
          {
            description: "",
            quantity: 1,
            unitCost: 0,
            sortOrder: 0,
          },
        ],
  );

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], ...patch, sortOrder: index };
      return next;
    });
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        description: "",
        quantity: 1,
        unitCost: 0,
        sortOrder: prev.length,
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) =>
      prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, sortOrder: i })),
    );
  }

  const subtotal = useMemo(() => {
    return roundCurrency(
      lines.reduce(
        (sum, l) => sum + roundCurrency((Number(l.quantity) || 0) * (Number(l.unitCost) || 0)),
        0,
      ),
    );
  }, [lines]);

  const taxAmount = props.isGstRegistered ? roundCurrency(subtotal * props.gstRate) : 0;
  const totalAmount = roundCurrency(subtotal + taxAmount);

  const payload = useMemo(() => JSON.stringify(lines), [lines]);

  return (
    <div className="space-y-4">
      <input type="hidden" name={props.name} value={payload} />

      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-100 text-neutral-800">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">Description</th>
              <th className="px-3 py-3 text-right font-semibold">Qty</th>
              <th className="px-3 py-3 text-right font-semibold">Unit Cost</th>
              <th className="px-3 py-3 text-right font-semibold">Amount</th>
              <th className="px-3 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const amount = roundCurrency((Number(line.quantity) || 0) * (Number(line.unitCost) || 0));
              return (
                <tr key={index} className="border-t border-neutral-200 bg-white">
                  <td className="px-3 py-3 align-top">
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                      className="h-10 w-[32rem] max-w-[82vw] rounded-lg border border-neutral-300 bg-white px-2 outline-none ring-neutral-400 focus:ring-2"
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-3 py-3 align-top text-right">
                    <input
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right outline-none ring-neutral-400 focus:ring-2"
                    />
                  </td>
                  <td className="px-3 py-3 align-top text-right">
                    <input
                      value={line.unitCost}
                      onChange={(e) => updateLine(index, { unitCost: Number(e.target.value) })}
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-10 w-32 rounded-lg border border-neutral-300 bg-white px-2 text-right outline-none ring-neutral-400 focus:ring-2"
                    />
                  </td>
                  <td className="px-3 py-3 align-top text-right font-medium text-neutral-900">
                    {formatCurrency(amount)}
                  </td>
                  <td className="px-3 py-3 align-top text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={lines.length <= 1}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Add Line
        </button>

        <div className="grid w-full max-w-xl gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm sm:w-auto">
          <div className="flex items-center justify-between gap-10">
            <span className="text-neutral-600">Subtotal</span>
            <span className="font-medium text-neutral-900">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-10">
            <span className="text-neutral-600">GST</span>
            <span className="font-medium text-neutral-900">{formatCurrency(taxAmount)}</span>
          </div>
          <div className="flex items-center justify-between gap-10 border-t border-neutral-200 pt-2">
            <span className="font-semibold text-neutral-900">Total</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(totalAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

