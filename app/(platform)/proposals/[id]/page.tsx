import Image from "next/image";
import Link from "next/link";
import { ProposalStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { ClientProposalDocument } from "@/app/components/proposal/client-proposal-document";
import { CopyLinkButton } from "@/app/components/ui/copy-link-button";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
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

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function statusTone(status: ProposalStatus) {
  if (status === ProposalStatus.APPROVED) return "success";
  if (status === ProposalStatus.REJECTED) return "danger";
  if (status === ProposalStatus.VIEWED) return "info";
  if (status === ProposalStatus.SENT) return "warning";
  return "neutral";
}

export default async function ProposalDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: {
      approvals: {
        orderBy: [{ createdAt: "desc" }],
      },
      signatures: {
        orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
      },
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
  const latestSignature = proposal.signatures[0] ?? null;
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

      <SectionCard title="Approval Status" description="Client-side approval state, signature evidence, and public viewing audit for this proposal.">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-stone-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Current status</p>
              <div className="mt-3">
                <StatusPill tone={statusTone(proposal.status)}>{proposal.status}</StatusPill>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-stone-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Client viewed</p>
              <p className="mt-2 text-sm font-semibold text-neutral-950">{formatDateTime(proposal.viewedAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-stone-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Latest decision</p>
              <p className="mt-2 text-sm font-semibold text-neutral-950">
                {proposal.approvals[0] ? `${proposal.approvals[0].clientName} · ${proposal.approvals[0].status}` : "No response yet"}
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {proposal.approvals[0]
                  ? formatDateTime(proposal.approvals[0].approvedAt ?? proposal.approvals[0].rejectedAt ?? proposal.approvals[0].createdAt)
                  : "Waiting for client action"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-stone-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Signature status</p>
              <p className="mt-2 text-sm font-semibold text-neutral-950">{latestSignature ? "Recorded" : "Pending"}</p>
              <p className="mt-1 text-sm text-neutral-600">{latestSignature ? formatDateTime(latestSignature.signedAt) : "No signature on file"}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Latest signature</p>
            {latestSignature ? (
              <div className="mt-4 space-y-4">
                <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                  <Image
                    src={latestSignature.signatureDataUrl}
                    alt={`Signature of ${latestSignature.signerName}`}
                    width={900}
                    height={280}
                    unoptimized
                    className="h-auto w-full"
                  />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-stone-50 px-4 py-3 text-sm text-neutral-700">
                  <p className="font-semibold text-neutral-950">{latestSignature.signerName}</p>
                  <p className="mt-1">{latestSignature.signerEmail}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-neutral-500">Signed {formatDateTime(latestSignature.signedAt)}</p>
                  <p className="mt-3 break-all text-xs text-neutral-500">IP: {latestSignature.ipAddress ?? "-"}</p>
                  <p className="mt-1 break-all text-xs text-neutral-500">User agent: {latestSignature.userAgent ?? "-"}</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-7 text-neutral-600">No client signature has been submitted from the public proposal page yet.</p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Approval Log" description="Immutable record of client approval and rejection responses captured from the public token.">
        {proposal.approvals.length === 0 ? (
          <p className="text-sm text-neutral-600">No approval activity recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {proposal.approvals.map((entry) => (
              <article key={entry.id} className="rounded-[22px] border border-slate-200 bg-stone-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={statusTone(entry.status)}>{entry.status}</StatusPill>
                      <p className="text-sm font-semibold text-neutral-950">{entry.clientName}</p>
                      <p className="text-sm text-neutral-600">{entry.clientEmail}</p>
                    </div>
                    <p className="mt-2 text-sm text-neutral-600">
                      Recorded {formatDateTime(entry.approvedAt ?? entry.rejectedAt ?? entry.createdAt)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-neutral-500">
                    <p>IP: {entry.ipAddress ?? "-"}</p>
                    <p className="mt-1 break-all">UA: {entry.userAgent ?? "-"}</p>
                  </div>
                </div>
                {entry.comment ? <p className="mt-4 text-sm leading-7 text-neutral-700">{entry.comment}</p> : null}
              </article>
            ))}
          </div>
        )}
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
