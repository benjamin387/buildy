import { notFound } from "next/navigation";
import { ClientProposalDocument } from "@/app/components/proposal/client-proposal-document";
import { ProposalApprovalPanel } from "@/app/share/proposal/[token]/proposal-approval-panel";
import { CompanyLogo } from "@/app/components/ui/company-logo";
import { getCompanyBranding } from "@/lib/branding";
import { prisma } from "@/lib/prisma";
import { markProposalViewedByToken } from "@/lib/proposals/approval";
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
      approvals: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
      },
      signatures: {
        orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
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
  const currentState = await markProposalViewedByToken(token);

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
          <div className="flex items-center gap-3">
            <CompanyLogo
              src={branding.logoUrl}
              companyName={branding.companyName}
              className="h-11 w-11 shrink-0 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
              fallbackClassName="rounded-2xl"
              fallbackMode="initial"
              fallbackTextClassName="text-sm font-bold"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-950">{branding.companyName}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Shared Proposal</p>
            </div>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">{proposal.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-600">
            This proposal link is intended for client review. It summarizes the quoted design scope, BOQ summary, pricing, and key terms, and lets you approve or request changes with an electronic signature.
          </p>
        </header>

        <ProposalApprovalPanel
          token={token}
          proposalTitle={proposal.title}
          initialStatus={currentState.status}
          initialClientName={proposal.clientName}
          initialDecision={
            proposal.approvals[0]
              ? {
                  clientName: proposal.approvals[0].clientName,
                  clientEmail: proposal.approvals[0].clientEmail,
                  status: proposal.approvals[0].status,
                  comment: proposal.approvals[0].comment,
                  approvedAt: proposal.approvals[0].approvedAt?.toISOString() ?? null,
                  rejectedAt: proposal.approvals[0].rejectedAt?.toISOString() ?? null,
                }
              : null
          }
          initialSignature={
            proposal.signatures[0]
              ? {
                  signerName: proposal.signatures[0].signerName,
                  signerEmail: proposal.signatures[0].signerEmail,
                  signatureDataUrl: proposal.signatures[0].signatureDataUrl,
                  signedAt: proposal.signatures[0].signedAt.toISOString(),
                }
              : null
          }
        />

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
