import { ProposalSection } from "@/app/components/proposal/proposal-section";

export type ProposalBoqAreaRow = {
  id: string;
  name: string;
  roomType: string;
  sellingTotal: number;
};

function money(n: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(n);
}

export function ProposalBOQSummary(props: { rows: ProposalBoqAreaRow[] }) {
  const total = props.rows.reduce((s, r) => s + r.sellingTotal, 0);

  return (
    <ProposalSection
      eyebrow="BOQ"
      title="Preliminary scope and BOQ summary"
      subtitle="A room-by-room summary of preliminary works for budgeting and scope alignment."
      avoidBreakInside
    >
      {props.rows.length === 0 ? (
        <p className="text-sm text-neutral-700">No preliminary BOQ items yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
            <p className="text-sm font-semibold text-neutral-900">Preliminary build estimate</p>
            <p className="text-sm font-semibold text-neutral-950 tabular-nums">{money(total)}</p>
          </div>

          <div className="overflow-hidden rounded-[22px] border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-white text-neutral-700">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Area</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Room type</th>
                  <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-200">
                    <td className="px-4 py-4 font-semibold text-neutral-950">{r.name}</td>
                    <td className="px-4 py-4 text-neutral-700">{r.roomType}</td>
                    <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">{money(r.sellingTotal)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 bg-stone-50">
                  <td className="px-4 py-4 font-semibold text-neutral-950" colSpan={2}>
                    Total
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">{money(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs leading-6 text-neutral-600">
            This summary is preliminary and may be refined after site verification, final measurements, and material selections.
          </p>
        </div>
      )}
    </ProposalSection>
  );
}

