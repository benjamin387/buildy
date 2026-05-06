import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { ClientProposalDocument } from "@/app/components/proposal/client-proposal-document";
import { CopyLinkButton } from "@/app/components/ui/copy-link-button";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { getCompanyBranding } from "@/lib/branding";
import { prisma } from "@/lib/prisma";
import { parseProposalContent } from "@/lib/proposals/content";
import { buildPublicProposalPath, buildPublicProposalUrl } from "@/lib/proposals/service";
import { requirePermission } from "@/lib/rbac";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ProposalDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: {
      quotation: {
        select: {
          id: true,
          projectId: true,
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

  await requirePermission({
    permission: Permission.QUOTE_READ,
    projectId: proposal.quotation.projectId,
  });

  const branding = await getCompanyBranding();
  const content = parseProposalContent(proposal.content);
  const sharePath = buildPublicProposalPath(proposal.publicToken);
  const shareUrl = buildPublicProposalUrl(proposal.publicToken);
  const projectAddress = [
    proposal.quotation.projectAddress1,
    proposal.quotation.projectAddress2,
    proposal.quotation.projectPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Proposals"
        title={proposal.title}
        subtitle={`Client-ready proposal generated from quotation ${proposal.quotation.quotationNumber}.`}
        backHref={`/projects/${proposal.quotation.projectId}/quotations/${proposal.quotation.id}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={sharePath}
              target="_blank"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
            >
              Open Public Page
            </Link>
            <CopyLinkButton value={shareUrl} label="Copy Share Link" />
          </div>
        }
      />

      <SectionCard title="Share Link" description="This tokenized link does not require login and stays stable when you regenerate the proposal.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="rounded-2xl border border-slate-200 bg-stone-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Public path</p>
            <p className="mt-1 break-all text-sm font-semibold text-neutral-950">{sharePath}</p>
            <p className="mt-2 break-all text-sm text-neutral-600">{shareUrl}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Generated</p>
              <p className="mt-1 text-sm font-semibold text-neutral-950">{formatDate(proposal.createdAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Updated</p>
              <p className="mt-1 text-sm font-semibold text-neutral-950">{formatDate(proposal.updatedAt)}</p>
            </div>
          </div>
        </div>
      </SectionCard>

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
    </main>
  );
}
