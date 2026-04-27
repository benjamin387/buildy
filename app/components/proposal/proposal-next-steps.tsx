import { ProposalSection } from "@/app/components/proposal/proposal-section";

export function ProposalNextSteps(props: { text?: string | null }) {
  return (
    <ProposalSection
      eyebrow="Next steps"
      title="How we proceed from concept to build"
      subtitle="A clear path to confirm scope, finalise pricing, and lock your timeline."
      avoidBreakInside
    >
      {props.text ? (
        <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{props.text}</p>
      ) : (
        <ol className="grid gap-3 text-sm leading-7 text-neutral-800">
          <li>
            <span className="font-semibold">1. Confirm direction</span> — agree on preferred style, materials, and key priorities.
          </li>
          <li>
            <span className="font-semibold">2. Site verification</span> — final measurements and site conditions review.
          </li>
          <li>
            <span className="font-semibold">3. Final quotation</span> — align BOQ, clarify inclusions/exclusions, confirm GST where applicable.
          </li>
          <li>
            <span className="font-semibold">4. Approval</span> — accept quotation and proceed to contract signing.
          </li>
          <li>
            <span className="font-semibold">5. Mobilisation</span> — schedule start date, procurement lead times, and project kick-off.
          </li>
        </ol>
      )}
    </ProposalSection>
  );
}

