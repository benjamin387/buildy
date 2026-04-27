import { ProposalSection } from "@/app/components/proposal/proposal-section";

function money(n: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(n);
}

export function ProposalInvestmentSummary(props: {
  preliminaryBuild: number;
  ffeAllowance: number;
  quotationTotal: number | null;
  notes?: string | null;
}) {
  return (
    <ProposalSection
      eyebrow="Investment"
      title="Investment summary"
      subtitle="A clear snapshot of the current scope and estimated investment. Final numbers are confirmed upon quotation acceptance."
      avoidBreakInside
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Tile label="Preliminary build estimate" value={money(props.preliminaryBuild)} />
        <Tile label="FF&E allowance" value={money(props.ffeAllowance)} />
        <Tile label="Quotation total (if issued)" value={props.quotationTotal !== null ? money(props.quotationTotal) : "-"} />
      </div>

      {props.notes ? (
        <div className="mt-5 rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Notes</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-800">{props.notes}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-2 text-xs leading-6 text-neutral-600">
        <p>Includes: works described in the presentation scope and preliminary BOQ.</p>
        <p>May vary with: final measurements, site conditions, material selections, and approved variations.</p>
      </div>
    </ProposalSection>
  );
}

function Tile(props: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">{props.label}</p>
      <p className="mt-3 text-xl font-semibold tracking-tight text-neutral-950 tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
        {props.value}
      </p>
    </div>
  );
}

