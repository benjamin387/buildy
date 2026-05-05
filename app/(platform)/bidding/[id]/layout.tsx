import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { StatusPill } from "@/app/components/ui/status-pill";
import { computeClosingRisk } from "@/lib/bidding/intelligence";
import { findOrRetry } from "@/lib/server/find-or-retry";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function tabClass(active: boolean) {
  return active
    ? "border-neutral-900 bg-neutral-900 text-white"
    : "border-slate-200 bg-white text-neutral-900 hover:bg-stone-50";
}

export default async function BidWorkspaceLayout(props: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id } = await props.params;

  const opp = await findOrRetry(() =>
    prisma.bidOpportunity.findUnique({
      where: { id },
      select: {
        id: true,
        opportunityNo: true,
        title: true,
        agency: true,
        procurementType: true,
        status: true,
        closingDate: true,
        briefingDate: true,
        bidPrice: true,
        estimatedCost: true,
        finalMargin: true,
        updatedAt: true,
      },
    }),
  );
  if (!opp) notFound();
  const closingRisk = computeClosingRisk(opp.closingDate ?? null, new Date());
  const riskTone =
    closingRisk.severity === "CRITICAL" || closingRisk.severity === "HIGH"
      ? "danger"
      : closingRisk.severity === "MEDIUM"
        ? "warning"
        : closingRisk.severity === "LOW"
          ? "info"
          : "neutral";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/bidding/pipeline" className="text-sm font-semibold text-neutral-600 hover:underline">
                Bidding
              </Link>
              <span className="text-neutral-300">/</span>
              <span className="text-sm font-semibold text-neutral-900">{opp.opportunityNo}</span>
              <StatusPill tone={opp.status === "AWARDED" ? "success" : opp.status === "LOST" ? "danger" : opp.status === "SUBMITTED" ? "info" : opp.status === "PENDING_APPROVAL" ? "warning" : "neutral"}>
                {String(opp.status).replaceAll("_", " ")}
              </StatusPill>
              <StatusPill tone={riskTone}>{closingRisk.severity === "NONE" ? "OK" : `${closingRisk.severity} RISK`}</StatusPill>
            </div>
            <h1 className="mt-3 line-clamp-2 text-2xl font-semibold tracking-tight text-neutral-950">{opp.title}</h1>
            <p className="mt-2 text-sm text-neutral-600">{opp.agency} · {String(opp.procurementType).replaceAll("_", " ")}</p>

            <div className="mt-4 grid gap-2 text-sm text-neutral-700 sm:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-stone-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Closing</p>
                <p className="mt-1 font-semibold text-neutral-950">{formatDate(opp.closingDate)}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-stone-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Briefing</p>
                <p className="mt-1 font-semibold text-neutral-950">{formatDate(opp.briefingDate)}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-stone-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Margin</p>
                <p className="mt-1 font-semibold text-neutral-950">{opp.finalMargin != null ? `${(Number(opp.finalMargin) * 100).toFixed(1)}%` : "-"}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/bidding/opportunities" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
              Opportunities
            </Link>
            <Link href="/bidding/awarded" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
              Awarded
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Tab href={`/bidding/${opp.id}`} label="Bid Workspace" />
          <Tab href={`/bidding/${opp.id}/timeline`} label="Tender Timeline" />
          <Tab href={`/bidding/${opp.id}/costing`} label="Costing & Margin" />
          <Tab href={`/bidding/${opp.id}/rfq`} label="Supplier RFQs" />
          <Tab href={`/bidding/${opp.id}/cost-builder`} label="Auto Cost Builder" />
          <Tab href={`/bidding/${opp.id}/cost-versions`} label="Cost Versions" />
          <Tab href={`/bidding/${opp.id}/documents`} label="Document Checklist" />
          <Tab href={`/bidding/${opp.id}/compliance`} label="Compliance Pack" />
          <Tab href={`/bidding/${opp.id}/submission-pack`} label="Submission Pack" />
          <Tab href={`/bidding/${opp.id}/approval`} label="Submission Approval" />
          <Tab href={`/bidding/${opp.id}/execution`} label="Execution" />
        </div>
      </div>

      {props.children}
    </div>
  );
}

function Tab(props: { href: string; label: string }) {
  // Active state is handled per-page by Next.js route segment. Keep it simple:
  return (
    <Link
      href={props.href}
      className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
    >
      {props.label}
    </Link>
  );
}
