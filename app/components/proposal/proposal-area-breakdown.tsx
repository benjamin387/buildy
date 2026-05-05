import { ProposalSection } from "@/app/components/proposal/proposal-section";
import { ProposalImageGrid, type ProposalImage } from "@/app/components/proposal/proposal-image-grid";

function compact(input: string | null | undefined): string {
  const v = (input ?? "").trim();
  return v ? v : "-";
}

export type ProposalArea = {
  id: string;
  name: string;
  roomType: string;
  clientRequirement?: string | null;
  proposedTheme?: string | null;
  proposedLayoutNotes?: string | null;
  proposedMaterials?: string | null;
  layoutTitle?: string | null;
  visuals: ProposalImage[];
};

export function ProposalAreaBreakdown(props: { areas: ProposalArea[] }) {
  return (
    <ProposalSection
      eyebrow="Room-by-room"
      title="Area breakdown"
      subtitle="A curated narrative for each space, aligned to your needs, usage, and finishing direction."
    >
      {props.areas.length === 0 ? (
        <p className="text-sm text-neutral-700">No areas added yet.</p>
      ) : (
        <div className="space-y-6">
          {props.areas.map((a) => (
            <section key={a.id} className="rounded-[22px] border border-slate-200 bg-white p-6 [break-inside:avoid]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">{a.roomType}</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950" style={{ fontFamily: "var(--font-display)" }}>
                    {a.name}
                  </h3>
                </div>
                {a.layoutTitle ? (
                  <div className="rounded-md border border-slate-200 bg-stone-50 px-4 py-3 text-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Layout</p>
                    <p className="mt-1 font-semibold text-neutral-950">{a.layoutTitle}</p>
                  </div>
                ) : null}
              </div>

              {a.visuals.length ? (
                <div className="mt-5">
                  <ProposalImageGrid images={a.visuals} columns={2} />
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <Info title="Client requirements" value={compact(a.clientRequirement)} />
                <Info title="Design direction" value={compact(a.proposedTheme)} />
                <Info title="Layout & usage notes" value={compact(a.proposedLayoutNotes)} />
                <Info title="Materials & finishes" value={compact(a.proposedMaterials)} />
              </div>
            </section>
          ))}
        </div>
      )}
    </ProposalSection>
  );
}

function Info(props: { title: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-800">{props.value}</p>
    </div>
  );
}

