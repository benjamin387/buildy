import Link from "next/link";
import { FileSearch, ExternalLink } from "lucide-react";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { prisma } from "@/lib/prisma";
import { computeClosingRisk } from "@/lib/bidding/intelligence";

function formatDate(value: Date | null): string {
  if (!value) return "TBC";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function formatCurrencyShort(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fitTone(label: string): "success" | "info" | "warning" | "neutral" {
  switch (label) {
    case "HIGH":
      return "success";
    case "MEDIUM":
      return "info";
    case "LOW":
      return "warning";
    default:
      return "neutral";
  }
}

function riskTone(severity: string): "danger" | "warning" | "info" | "neutral" {
  if (severity === "CRITICAL" || severity === "HIGH") return "danger";
  if (severity === "MEDIUM") return "warning";
  if (severity === "LOW") return "info";
  return "neutral";
}

function riskLabel(severity: string): string {
  if (severity === "CRITICAL") return "URGENT";
  if (severity === "HIGH") return "HIGH";
  if (severity === "MEDIUM") return "MEDIUM";
  if (severity === "LOW") return "LOW";
  return "OK";
}

async function getLatestGebizOpportunities() {
  try {
    return await prisma.bidOpportunity.findMany({
      where: {
        importHash: { not: null },
      },
      orderBy: [
        { fitScore: "desc" },
        { closingDate: "asc" },
        { updatedAt: "desc" },
      ],
      take: 6,
      select: {
        id: true,
        opportunityNo: true,
        title: true,
        agency: true,
        category: true,
        closingDate: true,
        estimatedValue: true,
        fitScore: true,
        fitLabel: true,
        status: true,
        gebizImportedItems: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          select: {
            detailUrl: true,
            createdAt: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("[dashboard/gebiz-widget] Failed to load opportunities:", error);
    return null;
  }
}

export async function GebizOpportunitiesWidget() {
  const opportunities = await getLatestGebizOpportunities();

  return (
    <SectionCard
      title="GeBIZ Inbox"
      description="Latest GeBIZ tenders ranked by fit score and closing soonest. Click an opportunity to triage in Bidding."
      actions={
        <Link
          href="/bidding/opportunities?source=GEBIZ"
          className="text-sm font-semibold text-neutral-900 hover:underline"
        >
          Open all →
        </Link>
      }
    >
      {opportunities === null ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-stone-50 px-4 py-6 text-sm text-neutral-600">
          GeBIZ opportunities are temporarily unavailable. Dashboard rendering remains safe while the feed is unavailable.
        </div>
      ) : opportunities.length === 0 ? (
        <EmptyState
          title="No GeBIZ opportunities yet"
          description="Wait for the next 02:00 SGT cron, or trigger /api/cron/gebiz-hub-sync manually."
          icon={<FileSearch className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-3">
          {opportunities.map((o) => {
            const imported = o.gebizImportedItems[0] ?? null;
            const risk = computeClosingRisk(o.closingDate ?? null, new Date());
            const fitLabelStr = String(o.fitLabel ?? "UNKNOWN");
            const fitScoreNum = Number(o.fitScore ?? 0);
            const estimatedValue = o.estimatedValue ? Number(o.estimatedValue) : null;

            return (
              <div
                key={o.id}
                className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-stone-50 p-4 shadow-sm transition hover:bg-stone-50"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={fitTone(fitLabelStr)}>
                        Fit {fitLabelStr}
                        {Number.isFinite(fitScoreNum) ? ` · ${fitScoreNum}` : ""}
                      </StatusPill>
                      <StatusPill tone={riskTone(risk.severity)}>
                        {riskLabel(risk.severity)}
                        {risk.daysLeft != null ? ` · ${risk.daysLeft}d` : ""}
                      </StatusPill>
                      <span className="text-xs text-neutral-500">{o.opportunityNo}</span>
                    </div>
                    <Link
                      href={`/bidding/${o.id}`}
                      className="mt-2 block text-sm font-semibold tracking-tight text-neutral-950 line-clamp-2 hover:underline"
                    >
                      {o.title}
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-neutral-700">
                        {o.agency || "Agency TBC"}
                      </span>
                      {o.category ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-neutral-700">
                          {o.category}
                        </span>
                      ) : null}
                      <span>Closes {formatDate(o.closingDate)}</span>
                      {estimatedValue && estimatedValue > 0 ? (
                        <span>· {formatCurrencyShort(estimatedValue)}</span>
                      ) : null}
                    </div>
                  </div>
                  {imported?.detailUrl ? (
                    <a
                      href={imported.detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-semibold text-neutral-900 hover:underline"
                    >
                      GeBIZ
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export function GebizOpportunitiesWidgetSkeleton() {
  return (
    <SectionCard
      title="GeBIZ Inbox"
      description="Latest GeBIZ tenders ranked by fit score and closing soonest. Click an opportunity to triage in Bidding."
    >
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm"
          >
            <div className="animate-pulse space-y-3">
              <div className="flex gap-2">
                <div className="h-5 w-20 rounded-full bg-slate-200" />
                <div className="h-5 w-16 rounded-full bg-slate-100" />
              </div>
              <div className="h-4 w-3/4 rounded bg-slate-200" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
