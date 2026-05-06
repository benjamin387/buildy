import { notFound } from "next/navigation";
import { ClientProposalDocument } from "@/app/components/proposal/client-proposal-document";
import { getCompanyBranding } from "@/lib/branding";
import { prisma } from "@/lib/prisma";
import { parseProposalContent } from "@/lib/proposals/content";

export const dynamic = "force-dynamic";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function SharedProposalPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;

  const proposal = await prisma.proposal.findUnique({
    where: { publicToken: token },
    include: {
      quotation: {
        select: {
          quotationNumber: true,
          issueDate: true,
          projectNameSnapshot: true,
          projectAddress1: true,
          projectAddress2: true,
          projectPostalCode: true,
        },
      },
    },
  });

  if (!proposal) notFound();

  const branding = await getCompanyBranding();
  const content = parseProposalContent(proposal.content);
  const projectAddress = [
    proposal.quotation.projectAddress1,
    proposal.quotation.projectAddress2,
    proposal.quotation.projectPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f5f4_0%,#fafaf9_24%,#ffffff_100%)] px-4 py-8 text-neutral-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[28px] border border-slate-200/80 bg-white px-6 py-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Shared Proposal</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">{proposal.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-600">
            This proposal link is intended for client review. It summarizes the quoted design scope, BOQ summary, pricing, and key terms.
          </p>
        </header>

        <ClientProposalDocument
          title={proposal.title}
          clientName={proposal.clientName}
          projectName={proposal.quotation.projectNameSnapshot}
          projectAddress={projectAddress || null}
          quotationNumber={proposal.quotation.quotationNumber}
          dateLabel={formatDate(proposal.quotation.issueDate)}
          branding={branding}
          content={content}
        />
      </div>
    </main>
  );
}
