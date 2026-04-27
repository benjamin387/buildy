"use client";

import { useMemo, useState } from "react";
import { SupplierBillLinesEditor } from "@/app/(platform)/projects/[projectId]/supplier-bills/components/bill-lines-editor";

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function SupplierBillCreateFormClient(props: {
  projectId: string;
  gstRate: number;
  suppliers: Array<{ id: string; name: string; type: string; gstRegistered: boolean }>;
  purchaseOrders: Array<{ id: string; poNumber: string }>;
  subcontracts: Array<{ id: string; title: string }>;
  action: (formData: FormData) => void;
}) {
  const [supplierId, setSupplierId] = useState(props.suppliers[0]?.id ?? "");

  const supplier = useMemo(
    () => props.suppliers.find((s) => s.id === supplierId) ?? null,
    [props.suppliers, supplierId],
  );

  if (props.suppliers.length === 0) {
    return <p className="mt-4 text-sm text-neutral-600">No suppliers found.</p>;
  }

  return (
    <form action={props.action} className="mt-5 grid gap-6">
      <input type="hidden" name="projectId" value={props.projectId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm sm:col-span-2">
          <span className="font-medium text-neutral-800">Supplier</span>
          <select
            name="supplierId"
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
          >
            {props.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.type} · {s.gstRegistered ? "GST" : "Non-GST"}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-neutral-800">Bill Date</span>
          <input
            name="billDate"
            type="date"
            required
            defaultValue={todayIsoDate()}
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-neutral-800">Due Date (optional)</span>
          <input
            name="dueDate"
            type="date"
            defaultValue=""
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-neutral-800">Link PO (optional)</span>
          <select
            name="purchaseOrderId"
            defaultValue=""
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
          >
            <option value="">Not linked</option>
            {props.purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.poNumber}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-neutral-800">Link Subcontract (optional)</span>
          <select
            name="subcontractId"
            defaultValue=""
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
          >
            <option value="">Not linked</option>
            {props.subcontracts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-neutral-800">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
        />
      </label>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Lines</p>
        <p className="mt-1 text-sm text-neutral-600">
          GST is {supplier?.gstRegistered ? "applied" : "not applied"} for this supplier.
        </p>
        <div className="mt-4">
          <SupplierBillLinesEditor
            name="linesJson"
            gstRate={props.gstRate}
            isGstRegistered={!!supplier?.gstRegistered}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
          Create Draft Bill
        </button>
      </div>
    </form>
  );
}

