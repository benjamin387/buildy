import { ProposalSection } from "@/app/components/proposal/proposal-section";

export function ProposalDesignConcept(props: { text: string }) {
  return (
    <ProposalSection eyebrow="Design concept" title="A cohesive direction, tailored to your lifestyle">
      <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{props.text}</p>
    </ProposalSection>
  );
}

