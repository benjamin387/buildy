import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  markBidAwardedAction,
  markBidSubmittedAction,
  updateBidStatusAction,
  convertAwardedBidAction,
  updateBidStrategyAction,
  upsertBidAgencyProfileAction,
  upsertBidCompetitorRecordAction,
  deleteBidCompetitorRecordAction,
  upsertBidWinLossAction,
} from "@/app/(platform)/bidding/actions";
import { safeQuery } from "@/lib/server/safe-query";
import { computeBidIntelligence } from "@/lib/bidding/intelligence";
import { computePricingIntelligence } from "@/lib/bidding/pricing-intelligence";
import { findOrRetry } from "@/lib/server/find-or-retry";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export const dynamic = "force-dynamic";

export default async function BidWorkspacePage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id } = await props.params;

  const opp = await safeQuery(
    () =>
      findOrRetry(() =>
        prisma.bidOpportunity.findUnique({
          where: { id },
          include: {
            approvals: { orderBy: [{ createdAt: "desc" }] },
            submissionChecklist: { orderBy: [{ sortOrder: "asc" }] },
            complianceChecklist: { orderBy: [{ sortOrder: "asc" }] },
            supplierQuotes: { orderBy: [{ createdAt: "desc" }], take: 20 },
            timelineMilestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }], take: 30 },
            competitorRecords: { orderBy: [{ isWinner: "desc" }, { createdAt: "desc" }], take: 10 },
            winLossRecord: true,
            agencyProfile: true,
            activities: { orderBy: [{ createdAt: "desc" }], take: 20 },
            awardedProject: { select: { id: true, projectCode: true, name: true } },
            awardedContract: { select: { id: true, contractNumber: true, status: true } },
          },
        }),
      ),
    null as any,
  );

  if (!opp) notFound();

  const checklistDone = (opp.submissionChecklist ?? []).filter((i: any) => i.status === "COMPLETED").length;
  const checklistTotal = (opp.submissionChecklist ?? []).length;
  const approvalsPending = (opp.approvals ?? []).filter((a: any) => a.status === "PENDING").length;
  const approvalsRejected = (opp.approvals ?? []).filter((a: any) => a.status === "REJECTED").length;

  const marginPct = opp.finalMargin != null ? Number(opp.finalMargin) * 100 : null;

  const intelligence = computeBidIntelligence({
    id: opp.id,
    opportunityNo: opp.opportunityNo,
    title: opp.title,
    agency: opp.agency,
    procurementType: String(opp.procurementType),
    category: opp.category ?? null,
    status: String(opp.status),
    closingDate: opp.closingDate ?? null,
    estimatedValue: opp.estimatedValue,
    finalMargin: opp.finalMargin,
    targetMargin: opp.targetMargin,
    submissionChecklist: (opp.submissionChecklist ?? []).map((c: any) => ({ status: String(c.status), isRequired: Boolean(c.isRequired) })),
    complianceChecklist: (opp.complianceChecklist ?? []).map((c: any) => ({ status: String(c.status), isRequired: Boolean(c.isRequired) })),
    approvals: (opp.approvals ?? []).map((a: any) => ({ status: String(a.status) })),
    supplierQuotes: opp.supplierQuotes ?? [],
  });

  const competitorPrices = (opp.competitorRecords ?? [])
    .map((r: any) => (r.quotedPrice != null ? Number(r.quotedPrice) : null))
    .filter((n: any) => typeof n === "number" && Number.isFinite(n) && n > 0) as number[];

  const pricingIntel = computePricingIntelligence({
    strategyMode: String(opp.strategyMode ?? "BALANCED") as any,
    pricingPosition: String(opp.pricingPosition ?? "MATCH") as any,
    estimatedCost: Number(opp.estimatedCost ?? 0),
    currentBidPrice: Number(opp.bidPrice ?? 0),
    procurementType: String(opp.procurementType),
    competitorPrices,
    estimatedValue: opp.estimatedValue != null ? Number(opp.estimatedValue) : null,
  });

  return (
    <main className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-3">
        <SummaryCard title="Bid Price" value={formatCurrency(Number(opp.bidPrice ?? 0))} hint="From costing (sell total)" />
        <SummaryCard title="Estimated Cost" value={formatCurrency(Number(opp.estimatedCost ?? 0))} hint="From costing (cost total)" />
        <SummaryCard
          title="Final Margin"
          value={marginPct != null ? `${marginPct.toFixed(1)}%` : "-"}
          hint="(Sell - Cost) / Sell"
          tone={marginPct != null && marginPct < 8 ? "danger" : marginPct != null && marginPct < 15 ? "warning" : "neutral"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Bid / No-Bid Decision" description="Set status and track submission readiness.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Checklist</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
                {checklistDone}/{checklistTotal}
              </p>
              <p className="mt-2 text-sm text-neutral-600">Submission items completed</p>
              <div className="mt-3">
                <Link href={`/bidding/${opp.id}/documents`}>
                  <ActionButton size="sm" variant="secondary">
                    Open checklist
                  </ActionButton>
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Compliance</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
                {(opp.complianceChecklist ?? []).filter((i: any) => i.status === "COMPLETED").length}/{(opp.complianceChecklist ?? []).length}
              </p>
              <p className="mt-2 text-sm text-neutral-600">Risk controls completed</p>
              <div className="mt-3">
                <Link href={`/bidding/${opp.id}/documents`}>
                  <ActionButton size="sm" variant="secondary">
                    Open compliance
                  </ActionButton>
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Approvals</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
                {approvalsPending > 0 ? `${approvalsPending} pending` : approvalsRejected > 0 ? `${approvalsRejected} rejected` : "Ready"}
              </p>
              <p className="mt-2 text-sm text-neutral-600">Internal approval workflow</p>
              <div className="mt-3">
                <Link href={`/bidding/${opp.id}/approval`}>
                  <ActionButton size="sm" variant="secondary">
                    Open approvals
                  </ActionButton>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <form action={updateBidStatusAction} className="rounded-2xl border border-slate-200 bg-white p-4">
              <input type="hidden" name="id" value={opp.id} />
              <label className="block text-sm font-semibold text-neutral-900">Status</label>
              <select
                name="status"
                defaultValue={opp.status}
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              >
                {["WATCHING", "BID_NO_BID", "PREPARING", "PENDING_APPROVAL", "SUBMITTED", "AWARDED", "LOST", "CANCELLED"].map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex justify-end">
                <ActionButton type="submit" size="sm">
                  Update
                </ActionButton>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-neutral-900">Next Actions</p>
              <p className="mt-2 text-sm text-neutral-600">
                Use these milestone actions to keep the pipeline consistent.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={markBidSubmittedAction}>
                  <input type="hidden" name="opportunityId" value={opp.id} />
                  <ActionButton type="submit" size="sm" variant="secondary">
                    Mark Submitted
                  </ActionButton>
                </form>
                <form action={markBidAwardedAction}>
                  <input type="hidden" name="opportunityId" value={opp.id} />
                  <ActionButton type="submit" size="sm" variant="secondary">
                    Mark Awarded
                  </ActionButton>
                </form>
                <form action={convertAwardedBidAction}>
                  <input type="hidden" name="opportunityId" value={opp.id} />
                  <ActionButton type="submit" size="sm">
                    Convert to Project
                  </ActionButton>
                </form>
                <Link href="/bidding/analytics">
                  <ActionButton type="button" size="sm" variant="secondary">
                    Director Analytics
                  </ActionButton>
                </Link>
              </div>
              {opp.awardedProject ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Converted:
                  <Link href={`/projects/${opp.awardedProject.id}`} className="ml-2 font-semibold underline">
                    {opp.awardedProject.projectCode ?? "Project"}
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Tender Intelligence" description="Fit scoring, bid/no-bid scoring, closing risk alerts, and AI-style summary (deterministic).">
          <div className="grid gap-4 sm:grid-cols-3">
            <ScoreCard title="Tender Fit" value={`${intelligence.tenderFitScore}/100`} tone={intelligence.tenderFitScore >= 75 ? "success" : intelligence.tenderFitScore >= 55 ? "warning" : "danger"} hint="Capability & relevance score" />
            <ScoreCard title="Bid / No-Bid" value={`${intelligence.bidNoBidScore}/100`} tone={intelligence.bidNoBidScore >= 75 ? "success" : intelligence.bidNoBidScore >= 55 ? "warning" : "danger"} hint="Commercial & readiness score" />
            <ScoreCard title="Readiness" value={`${intelligence.readinessScore}/100`} tone={intelligence.readinessScore >= 75 ? "success" : intelligence.readinessScore >= 55 ? "warning" : "danger"} hint="Checklist & approvals" />
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-stone-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-950">{intelligence.summary.headline}</p>
                <p className="mt-1 text-xs text-neutral-600">{intelligence.closingRisk.message}</p>
              </div>
              <StatusPill tone={intelligence.closingRisk.severity === "CRITICAL" ? "danger" : intelligence.closingRisk.severity === "HIGH" ? "danger" : intelligence.closingRisk.severity === "MEDIUM" ? "warning" : intelligence.closingRisk.severity === "LOW" ? "info" : "neutral"}>
                {intelligence.closingRisk.severity === "NONE" ? "ON TRACK" : `${intelligence.closingRisk.severity} RISK`}
              </StatusPill>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">AI Tender Summary</p>
                <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                  {intelligence.summary.bullets.slice(0, 6).map((b) => (
                    <li key={b} className="leading-relaxed">
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Recommended Next Actions</p>
                {intelligence.summary.nextActions.length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-700">No immediate actions detected.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                    {intelligence.summary.nextActions.slice(0, 6).map((a) => (
                      <li key={a} className="leading-relaxed">
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {intelligence.alerts.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {intelligence.alerts.slice(0, 4).map((al) => (
                  <div
                    key={`${al.title}-${al.severity}`}
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      al.severity === "CRITICAL" || al.severity === "HIGH"
                        ? "border-red-200 bg-red-50 text-red-800"
                        : al.severity === "MEDIUM"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-slate-200 bg-white text-neutral-800"
                    }`}
                  >
                    <p className="font-semibold">{al.title}</p>
                    {al.description ? <p className="mt-0.5 text-xs opacity-90">{al.description}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Strategy & Pricing Intelligence" description="Set bid strategy mode and see recommended pricing guidance to protect win probability and margin.">
          <form action={updateBidStrategyAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="opportunityId" value={opp.id} />
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Strategy Mode</label>
              <select
                name="strategyMode"
                defaultValue={String(opp.strategyMode ?? "BALANCED")}
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              >
                <option value="CONSERVATIVE">Conservative</option>
                <option value="BALANCED">Balanced</option>
                <option value="AGGRESSIVE">Aggressive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Pricing Position</label>
              <select
                name="pricingPosition"
                defaultValue={String(opp.pricingPosition ?? "MATCH")}
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              >
                <option value="UNDERCUT">Undercut</option>
                <option value="MATCH">Match</option>
                <option value="PREMIUM">Premium</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Strategy Notes</label>
              <textarea
                name="strategyNotes"
                defaultValue={opp.strategyNotes ?? ""}
                className="mt-1 h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                placeholder="Key positioning, constraints, win themes, exclusions..."
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <ActionButton type="submit" size="sm">
                Save Strategy
              </ActionButton>
            </div>
          </form>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Target Margin</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{pricingIntel.targetMarginPercent.toFixed(1)}%</p>
              <p className="mt-2 text-xs text-neutral-600">Based on strategy + position</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Recommended Bid</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{formatCurrency(pricingIntel.recommendedBidPrice)}</p>
              <p className="mt-2 text-xs text-neutral-600">From cost and target margin</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Delta vs Current</p>
              <p className={`mt-2 text-2xl font-semibold tracking-tight ${pricingIntel.deltaFromCurrent > 0 ? "text-amber-700" : pricingIntel.deltaFromCurrent < 0 ? "text-emerald-700" : "text-neutral-950"}`}>
                {pricingIntel.deltaFromCurrent === 0 ? "0" : formatCurrency(Math.abs(pricingIntel.deltaFromCurrent))}
              </p>
              <p className="mt-2 text-xs text-neutral-600">
                {pricingIntel.deltaFromCurrent > 0 ? "Increase" : pricingIntel.deltaFromCurrent < 0 ? "Decrease" : "Aligned"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Pricing Narrative</p>
            <ul className="mt-2 space-y-1 text-sm text-neutral-700">
              {pricingIntel.narrative.slice(0, 6).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Bid Snapshot" description="Key opportunity fields.">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Opportunity No</dt>
              <dd className="mt-1 font-semibold text-neutral-950">{opp.opportunityNo}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Agency</dt>
              <dd className="mt-1 font-semibold text-neutral-950">{opp.agency}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Procurement Type</dt>
              <dd className="mt-1 font-semibold text-neutral-950">{String(opp.procurementType).replaceAll("_", " ")}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Estimated Value</dt>
              <dd className="mt-1 font-semibold text-neutral-950">{opp.estimatedValue ? formatCurrency(Number(opp.estimatedValue)) : "-"}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Target Margin</dt>
              <dd className="mt-1 font-semibold text-neutral-950">
                {opp.targetMargin != null ? `${(Number(opp.targetMargin) * 100).toFixed(1)}%` : "-"}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Last Updated</dt>
              <dd className="mt-1 font-semibold text-neutral-950">{formatDateTime(opp.updatedAt)}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Submitted At</dt>
              <dd className="mt-1 font-semibold text-neutral-950">{formatDateTime(opp.submittedAt)}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Awarded At</dt>
              <dd className="mt-1 font-semibold text-neutral-950">{formatDateTime(opp.awardedAt)}</dd>
            </div>
          </dl>

          {opp.remarks ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-stone-50 p-4 text-sm text-neutral-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Remarks</p>
              <p className="mt-2 whitespace-pre-wrap">{opp.remarks}</p>
            </div>
          ) : (
            <EmptyState title="No remarks yet" description="Add remarks from the opportunity register if needed." />
          )}
        </SectionCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Agency Profile" description="Buyer profiling: preferences, typical categories, risk notes.">
          <form action={upsertBidAgencyProfileAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="opportunityId" value={opp.id} />
            <input type="hidden" name="id" value={opp.agencyProfile?.id ?? ""} />
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Agency Name</label>
              <input
                name="name"
                required
                defaultValue={opp.agencyProfile?.name ?? opp.agency}
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Sector</label>
              <input
                name="sector"
                defaultValue={opp.agencyProfile?.sector ?? ""}
                placeholder="e.g. Education / Healthcare / Town Council"
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Typical Categories</label>
              <input
                name="typicalCategories"
                defaultValue={opp.agencyProfile?.typicalCategories ?? ""}
                placeholder="e.g. Interior fit-out, M&E, Renovation"
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Notes</label>
              <textarea
                name="notes"
                defaultValue={opp.agencyProfile?.notes ?? ""}
                className="mt-1 h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                placeholder="Past experience, evaluation criteria, contract risks, payment quirks..."
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <ActionButton type="submit" size="sm">
                Save Profile
              </ActionButton>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Competitor Tracking" description="Capture competitor pricing after tender results or debriefs (manual input only).">
          {(opp.competitorRecords ?? []).length === 0 ? (
            <EmptyState title="No competitor records yet" description="Add competitor pricing records to improve pricing intelligence over time." />
          ) : (
            <div className="space-y-2">
              {(opp.competitorRecords ?? []).map((r: any) => (
                <div key={r.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">{r.competitorName}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {r.quotedPrice != null ? `SGD ${Math.round(Number(r.quotedPrice)).toLocaleString("en-SG")}` : "Price unknown"} · {r.isWinner ? "Winner" : "Observed"}
                      </p>
                      {r.notes ? <p className="mt-2 text-xs text-neutral-600 whitespace-pre-wrap">{r.notes}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill tone={r.isWinner ? "warning" : "neutral"}>{r.isWinner ? "Winner" : "Signal"}</StatusPill>
                      <form action={deleteBidCompetitorRecordAction}>
                        <input type="hidden" name="opportunityId" value={opp.id} />
                        <input type="hidden" name="id" value={r.id} />
                        <ActionButton type="submit" size="sm" variant="danger">
                          Remove
                        </ActionButton>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-stone-50 p-4">
            <p className="text-sm font-semibold text-neutral-950">Add Competitor Record</p>
            <form action={upsertBidCompetitorRecordAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="opportunityId" value={opp.id} />
              <input type="hidden" name="id" value="" />
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-neutral-900">Competitor Name</label>
                <input
                  name="competitorName"
                  required
                  className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  placeholder="e.g. XYZ Builders Pte Ltd"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-900">Quoted Price (SGD)</label>
                <input
                  name="quotedPrice"
                  inputMode="decimal"
                  className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-right text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  placeholder="e.g. 80000"
                />
              </div>
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900">
                <input type="checkbox" name="isWinner" className="h-4 w-4 accent-neutral-900" />
                Winner
              </label>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-neutral-900">Notes</label>
                <textarea
                  name="notes"
                  className="mt-1 h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <ActionButton type="submit" size="sm">
                  Add Competitor
                </ActionButton>
              </div>
            </form>
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Win / Loss Tracking" description="Capture outcome details and reasons for learning and pricing intelligence.">
          <form action={upsertBidWinLossAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="opportunityId" value={opp.id} />
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Result</label>
              <select
                name="result"
                defaultValue={opp.winLossRecord?.result ?? (opp.status === "AWARDED" ? "WON" : opp.status === "LOST" ? "LOST" : "LOST")}
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              >
                <option value="WON">Won</option>
                <option value="LOST">Lost</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Awarded Value (SGD)</label>
              <input
                name="awardedValue"
                inputMode="decimal"
                defaultValue={opp.winLossRecord?.awardedValue != null ? String(opp.winLossRecord.awardedValue) : ""}
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-right text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Decision Date</label>
              <input
                name="decisionDate"
                defaultValue={opp.winLossRecord?.decisionDate ? String(opp.winLossRecord.decisionDate).slice(0, 10) : ""}
                placeholder="YYYY-MM-DD"
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Win Reason</label>
              <textarea
                name="winReason"
                defaultValue={opp.winLossRecord?.winReason ?? ""}
                className="mt-1 h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                placeholder="Key win themes: capability, track record, approach, pricing, timeline..."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Loss Reason</label>
              <textarea
                name="lostReason"
                defaultValue={opp.winLossRecord?.lostReason ?? ""}
                className="mt-1 h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                placeholder="Loss reasons: price, compliance, timeline, scoring, capability mismatch..."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Competitor Summary</label>
              <textarea
                name="competitorSummary"
                defaultValue={opp.winLossRecord?.competitorSummary ?? ""}
                className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                placeholder="If known: winner + pricing positioning + key factors."
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <ActionButton type="submit" size="sm">
                Save Outcome
              </ActionButton>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Tender Timeline (Preview)" description="Next upcoming milestones. Manage full timeline in Tender Timeline tab.">
          {(opp.timelineMilestones ?? []).length === 0 ? (
            <EmptyState title="No timeline milestones" description="Milestones are generated on opportunity creation." />
          ) : (
            <div className="space-y-2">
              {(opp.timelineMilestones ?? []).slice(0, 6).map((m: any) => (
                <div key={m.id} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-950">{m.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">Due {formatDateTime(m.dueDate)}</p>
                  </div>
                  <StatusPill tone={m.status === "COMPLETED" ? "success" : m.status === "MISSED" ? "danger" : "warning"}>{String(m.status).replaceAll("_", " ")}</StatusPill>
                </div>
              ))}
              <div className="pt-2">
                <Link href={`/bidding/${opp.id}/timeline`}>
                  <ActionButton size="sm" variant="secondary">
                    Open timeline
                  </ActionButton>
                </Link>
              </div>
            </div>
          )}
        </SectionCard>
      </section>

      <SectionCard title="Recent Activity" description="Last 20 actions on this bid.">
        {(opp.activities ?? []).length === 0 ? (
          <EmptyState title="No activity yet" description="Actions across costing, documents, approvals will appear here." />
        ) : (
          <div className="space-y-3">
            {opp.activities.map((a: any) => (
              <div key={a.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-950">{a.title}</p>
                    {a.description ? <p className="mt-0.5 line-clamp-2 text-xs text-neutral-600">{a.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone="neutral">{String(a.type).replaceAll("_", " ")}</StatusPill>
                    <span className="text-xs text-neutral-500">{formatDateTime(a.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function SummaryCard(props: { title: string; value: string; hint: string; tone?: "neutral" | "warning" | "danger" }) {
  const tone = props.tone ?? "neutral";
  const badge =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-white text-neutral-700";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
          <p className="mt-2 text-sm text-neutral-600">{props.hint}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge}`}>Live</span>
      </div>
    </div>
  );
}

function ScoreCard(props: { title: string; value: string; hint: string; tone: "success" | "warning" | "danger" }) {
  const badge =
    props.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : props.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
          <p className="mt-2 text-sm text-neutral-600">{props.hint}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge}`}>
          Score
        </span>
      </div>
    </div>
  );
}
