import { ProposalSection } from "@/app/components/proposal/proposal-section";

export type ProposalFFEItem = {
  areaName: string;
  title: string;
  description?: string | null;
  supplierName?: string | null;
  purchaseUrl?: string | null;
  unitPrice: number;
  quantity: number;
  leadTimeDays?: number | null;
  availabilityStatus?: string | null;
  remarks?: string | null;
};

function money(n: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(n);
}

export function ProposalFFESection(props: { items: ProposalFFEItem[] }) {
  const total = props.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return (
    <ProposalSection
      eyebrow="FF&E"
      title="Furniture, fixtures and equipment schedule"
      subtitle="Curated items that complete the concept. Final selections can be aligned to your preferred brands and lead times."
      avoidBreakInside
    >
      {props.items.length === 0 ? (
        <p className="text-sm text-neutral-700">No FF&E proposals added yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
            <p className="text-sm font-semibold text-neutral-900">Total allowance (indicative)</p>
            <p className="text-sm font-semibold text-neutral-950 tabular-nums">{money(total)}</p>
          </div>

          <div className="overflow-hidden rounded-[22px] border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-white text-neutral-700">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Area</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Item</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Supplier</th>
                  <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Unit</th>
                  <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Qty</th>
                  <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Total</th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((i, idx) => (
                  <tr key={`${i.areaName}-${i.title}-${idx}`} className="border-t border-slate-200">
                    <td className="px-4 py-4 align-top text-neutral-700">{i.areaName}</td>
                    <td className="px-4 py-4 align-top text-neutral-900">
                      <p className="font-semibold">{i.title}</p>
                      {i.description ? <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-neutral-600">{i.description}</p> : null}
                      {i.purchaseUrl ? (
                        <p className="mt-2 text-xs text-neutral-500">
                          Link: <span className="break-all">{i.purchaseUrl}</span>
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 align-top text-neutral-700">
                      <p className="font-semibold text-neutral-900">{i.supplierName ?? "-"}</p>
                      {i.leadTimeDays ? <p className="mt-1 text-xs text-neutral-500">Lead time: {i.leadTimeDays} days</p> : null}
                      {i.availabilityStatus ? <p className="text-xs text-neutral-500">Status: {i.availabilityStatus}</p> : null}
                    </td>
                    <td className="px-4 py-4 align-top text-right font-semibold text-neutral-950 tabular-nums">{money(i.unitPrice)}</td>
                    <td className="px-4 py-4 align-top text-right font-semibold text-neutral-950 tabular-nums">{i.quantity}</td>
                    <td className="px-4 py-4 align-top text-right font-semibold text-neutral-950 tabular-nums">{money(i.unitPrice * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs leading-6 text-neutral-600">
            Notes: Availability and pricing may vary based on supplier timelines and final selections. We will confirm before purchase.
          </p>
        </div>
      )}
    </ProposalSection>
  );
}

