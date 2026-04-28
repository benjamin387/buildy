import Link from "next/link";
import { FileSearch } from "lucide-react";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null): string {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function getStatusTone(status: string): "info" | "warning" | "neutral" {
  if (status === "OPEN") return "info";
  if (status === "CLOSED") return "warning";
  return "neutral";
}

async function getLatestGebizOpportunities() {
  try {
    return await prisma.gebizOpportunity.findMany({
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: {
        id: true,
        title: true,
        agency: true,
        closingAt: true,
        detailUrl: true,
        status: true,
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
      title="GeBIZ Opportunities"
      description="Latest imported public-sector tender opportunities from the GeBIZ RSS feed."
    >
      {opportunities === null ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-stone-50 px-4 py-6 text-sm text-neutral-600">
          GeBIZ opportunities are temporarily unavailable. Dashboard rendering remains safe while the feed or table is unavailable.
        </div>
      ) : opportunities.length === 0 ? (
        <EmptyState
          title="No GeBIZ opportunities imported yet"
          description="Run the GeBIZ import route or wait for the scheduled cron run to populate this widget."
          icon={<FileSearch className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-3">
          {opportunities.map((opportunity) => (
            <div
              key={opportunity.id}
              className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-stone-50 p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-tight text-neutral-950">
                    {opportunity.title}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-neutral-700">
                      {opportunity.agency || "Agency not provided"}
                    </span>
                    <span>Closing {formatDate(opportunity.closingAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={getStatusTone(opportunity.status)}>
                    {opportunity.status}
                  </StatusPill>
                  {opportunity.detailUrl ? (
                    <Link
                      href={opportunity.detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-neutral-900 hover:underline"
                    >
                      View tender
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-neutral-400">No link</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function GebizOpportunitiesWidgetSkeleton() {
  return (
    <SectionCard
      title="GeBIZ Opportunities"
      description="Latest imported public-sector tender opportunities from the GeBIZ RSS feed."
    >
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
          >
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-3/4 rounded bg-slate-200" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
