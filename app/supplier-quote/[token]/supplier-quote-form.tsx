"use client";

import * as React from "react";

type QuoteLine = {
  description: string;
  unit: string;
  quantity: string;
  unitRate: string;
};

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(n);
}

export function SupplierQuoteForm(props: {
  token: string;
  initial: {
    supplierName: string;
    rfqTitle: string;
    replyDeadline: string | null;
    briefingNotes: string | null;
    scopeSummary: string | null;
    tradeTitle: string | null;
    tradeScopeSummary: string | null;
    quote: {
      leadTimeDays: number | null;
      exclusions: string | null;
      remarks: string | null;
      quotationFileUrl: string | null;
      lines: Array<{ description: string; unit: string | null; quantity: number; unitRate: number }>;
    };
  };
}) {
  const [leadTimeDays, setLeadTimeDays] = React.useState(props.initial.quote.leadTimeDays?.toString() ?? "");
  const [exclusions, setExclusions] = React.useState(props.initial.quote.exclusions ?? "");
  const [remarks, setRemarks] = React.useState(props.initial.quote.remarks ?? "");
  const [quotationFileUrl, setQuotationFileUrl] = React.useState(props.initial.quote.quotationFileUrl ?? "");
  const [lines, setLines] = React.useState<QuoteLine[]>(
    props.initial.quote.lines.length
      ? props.initial.quote.lines.map((l) => ({
          description: l.description,
          unit: l.unit ?? "",
          quantity: String(l.quantity ?? 0),
          unitRate: String(l.unitRate ?? 0),
        }))
      : [{ description: "", unit: "", quantity: "1", unitRate: "0" }],
  );
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  const total = React.useMemo(() => {
    return lines.reduce((sum, l) => sum + toNumber(l.quantity) * toNumber(l.unitRate), 0);
  }, [lines]);

  function updateLine(idx: number, patch: Partial<QuoteLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: "", unit: "", quantity: "1", unitRate: "0" }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const payload = {
      leadTimeDays: leadTimeDays.trim() ? Number(leadTimeDays) : null,
      exclusions: exclusions.trim() || null,
      remarks: remarks.trim() || null,
      quotationFileUrl: quotationFileUrl.trim() || null,
      lines: lines
        .map((l) => ({
          description: l.description.trim(),
          unit: l.unit.trim() || null,
          quantity: Number(l.quantity),
          unitRate: Number(l.unitRate),
        }))
        .filter((l) => l.description),
    };

    try {
      const res = await fetch(`/api/supplier-quote/${props.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to submit quote.");
      }
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1400);
    } catch (err: any) {
      setStatus("error");
      setError(typeof err?.message === "string" ? err.message : "Failed to submit quote.");
    }
  }

  const pill =
    status === "saving"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : status === "saved"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : status === "error"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-white text-neutral-600 border-slate-200";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Supplier Quote Portal</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.initial.rfqTitle}</h1>
            <p className="mt-2 text-sm text-neutral-600">
              Supplier: <span className="font-semibold text-neutral-950">{props.initial.supplierName}</span>
              {props.initial.tradeTitle ? <span className="text-neutral-300"> · </span> : null}
              {props.initial.tradeTitle ? <span className="font-semibold text-neutral-900">{props.initial.tradeTitle}</span> : null}
            </p>
            {props.initial.replyDeadline ? (
              <p className="mt-1 text-sm text-neutral-600">
                Reply by: <span className="font-semibold text-neutral-950">{props.initial.replyDeadline}</span>
              </p>
            ) : null}
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${pill}`}>
            {status === "idle" ? "Draft" : status === "saving" ? "Submitting..." : status === "saved" ? "Submitted" : "Error"}
          </span>
        </div>
      </div>

      {(props.initial.scopeSummary || props.initial.briefingNotes || props.initial.tradeScopeSummary) ? (
        <div className="rounded-2xl border border-slate-200 bg-stone-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Scope & Notes</p>
          {props.initial.scopeSummary ? <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-800">{props.initial.scopeSummary}</p> : null}
          {props.initial.tradeScopeSummary ? <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-800">{props.initial.tradeScopeSummary}</p> : null}
          {props.initial.briefingNotes ? <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{props.initial.briefingNotes}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Lead Time (days)" value={leadTimeDays} onChange={setLeadTimeDays} inputMode="numeric" placeholder="e.g. 21" />
        <Field label="Quotation PDF URL (optional)" value={quotationFileUrl} onChange={setQuotationFileUrl} inputMode="text" placeholder="https://..." className="lg:col-span-2" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-neutral-950">Pricing Lines</p>
            <p className="mt-1 text-sm text-neutral-600">Enter unit rate and quantities. Total is auto-calculated.</p>
          </div>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          >
            Add Line
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[780px] w-full text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              <tr className="border-b border-slate-200">
                <th className="py-3 pr-3">Description</th>
                <th className="py-3 pr-3">Unit</th>
                <th className="py-3 pr-3 text-right">Qty</th>
                <th className="py-3 pr-3 text-right">Unit Rate</th>
                <th className="py-3 pr-3 text-right">Total</th>
                <th className="py-3"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, idx) => {
                const lineTotal = toNumber(l.quantity) * toNumber(l.unitRate);
                return (
                  <tr key={idx}>
                    <td className="py-3 pr-3 align-top">
                      <input
                        value={l.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        placeholder="e.g. Supply & install gypsum partition wall"
                        required={idx === 0}
                      />
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <input
                        value={l.unit}
                        onChange={(e) => updateLine(idx, { unit: e.target.value })}
                        className="h-10 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        placeholder="m2"
                      />
                    </td>
                    <td className="py-3 pr-3 align-top text-right">
                      <input
                        value={l.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        inputMode="decimal"
                        className="h-10 w-28 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm tabular-nums shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                      />
                    </td>
                    <td className="py-3 pr-3 align-top text-right">
                      <input
                        value={l.unitRate}
                        onChange={(e) => updateLine(idx, { unitRate: e.target.value })}
                        inputMode="decimal"
                        className="h-10 w-32 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm tabular-nums shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                      />
                    </td>
                    <td className="py-3 pr-3 align-top text-right font-semibold tabular-nums text-neutral-950">{money(lineTotal)}</td>
                    <td className="py-3 align-top">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                        aria-label="Remove line"
                        disabled={lines.length <= 1}
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
          <p className="text-sm text-neutral-600">Total (SGD)</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-950">{money(total)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TextArea label="Exclusions (optional)" value={exclusions} onChange={setExclusions} placeholder="List exclusions or assumptions clearly." />
        <TextArea label="Remarks (optional)" value={remarks} onChange={setRemarks} placeholder="Warranty, payment terms, schedule notes, etc." />
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>
      ) : null}

      <div className="sticky bottom-3 z-10">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-neutral-600">When you submit, your pricing will be visible to the Buildy tender team.</p>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-200 disabled:opacity-60"
              disabled={status === "saving"}
            >
              Submit Quote
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
}) {
  return (
    <div className={props.className}>
      <label className="block text-sm font-semibold text-neutral-900">{props.label}</label>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}

function TextArea(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block text-sm font-semibold text-neutral-900">{props.label}</label>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 h-32 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
        placeholder={props.placeholder}
      />
    </div>
  );
}

