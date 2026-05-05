import "server-only";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ActivitySeverity } from "@prisma/client";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  FileText,
  Info,
  PenSquare,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type TimelineItem = {
  id: string;
  occurredAt: Date;
  title: string;
  description: string | null;
  severity: ActivitySeverity;
  createdBy: string | null;
  sourceLabel: string;
  metadataJson: any;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function iconFor(item: TimelineItem) {
  const t = item.title.toLowerCase();
  if (t.includes("created")) return FileText;
  if (t.includes("updated")) return PenSquare;
  if (t.includes("sent")) return Send;
  if (t.includes("approved")) return ShieldCheck;
  if (t.includes("rejected")) return XCircle;
  if (t.includes("signed")) return CheckCircle2;
  return Clock;
}

function severityTone(sev: ActivitySeverity): "neutral" | "warning" | "success" | "danger" {
  if (sev === "IMPORTANT") return "success";
  if (sev === "WARNING") return "warning";
  return "neutral";
}

export async function ActivityTimeline(props: {
  entityType: string;
  entityId: string;
  title?: string;
  description?: string;
  take?: number;
  viewAllHref?: string | null;
  includeProjectTimelineFallback?: boolean;
}) {
  const take = props.take ?? 20;

  const [events, projectTimeline] = await Promise.all([
    prisma.activityEvent
      .findMany({
        where: { entityType: props.entityType, entityId: props.entityId },
        orderBy: [{ createdAt: "desc" }],
        take,
      })
      .catch(() => []),
    props.includeProjectTimelineFallback && props.entityType === "Project"
      ? prisma.projectTimelineItem
          .findMany({
            where: { projectId: props.entityId },
            orderBy: [{ occurredAt: "desc" }],
            take,
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const mapped: TimelineItem[] = [
    ...events.map((e) => ({
      id: `activity:${e.id}`,
      occurredAt: e.createdAt,
      title: e.title,
      description: e.description ?? null,
      severity: e.severity,
      createdBy: e.createdBy ?? null,
      sourceLabel: (e.metadataJson as any)?.source ?? "USER",
      metadataJson: e.metadataJson as any,
    })),
    ...projectTimeline.map((p) => ({
      id: `projectTimeline:${p.id}`,
      occurredAt: p.occurredAt,
      title: p.title,
      description: p.description ?? null,
      severity: "INFO" as ActivitySeverity,
      createdBy: null,
      sourceLabel: "USER",
      metadataJson: p.metadata as any,
    })),
  ];

  mapped.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const grouped = new Map<string, TimelineItem[]>();
  for (const item of mapped) {
    const key = formatDate(item.occurredAt);
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  const groupEntries = Array.from(grouped.entries());

  return (
    <SectionCard
      title={props.title ?? "Activity Timeline"}
      description={
        props.description ??
        "Immutable activity events and audit markers. Expand entries to view details."
      }
      actions={
        props.viewAllHref ? (
          <Link href={props.viewAllHref} className="text-sm font-semibold text-neutral-900 underline">
            View all
          </Link>
        ) : null
      }
    >
      {mapped.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-stone-50 p-6 text-sm text-neutral-700">
          No activity recorded yet.
        </div>
      ) : (
        <div className="space-y-8">
          {groupEntries.map(([day, items]) => (
            <div key={day}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                  {day}
                </span>
                <span className="h-px flex-1 bg-slate-200/70" />
              </div>

              <div className="mt-4 space-y-3">
                {items.map((item) => {
                  const Icon = iconFor(item);
                  const changedKeys: string[] = Array.isArray(item.metadataJson?.changedKeys)
                    ? item.metadataJson.changedKeys
                    : [];

                  return (
                    <details
                      key={item.id}
                      className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm open:shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]"
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-stone-50 text-neutral-800">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-neutral-950">
                                {item.title}
                              </p>
                              <StatusPill tone={severityTone(item.severity)}>
                                {item.severity}
                              </StatusPill>
                              {item.sourceLabel ? (
                                <StatusPill tone="neutral">{item.sourceLabel}</StatusPill>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-neutral-600">
                              {formatTime(item.occurredAt)}
                              {item.createdBy ? ` · ${item.createdBy}` : ""}
                            </p>
                            {item.description ? (
                              <p className="mt-2 text-sm leading-6 text-neutral-700">
                                {item.description}
                              </p>
                            ) : null}
                            {changedKeys.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {changedKeys.slice(0, 8).map((k) => (
                                  <StatusPill key={k} tone="neutral">
                                    {k}
                                  </StatusPill>
                                ))}
                                {changedKeys.length > 8 ? (
                                  <StatusPill tone="neutral">+{changedKeys.length - 8}</StatusPill>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-neutral-500">
                          <Info className="h-4 w-4" />
                          Details
                        </span>
                      </summary>

                      <div className="mt-4 space-y-3 border-t border-slate-200/70 pt-4">
                        {item.metadataJson ? (
                          <div className="rounded-xl border border-slate-200 bg-stone-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                              Metadata
                            </p>
                            <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-neutral-800">
                              {safeStringify(item.metadataJson)}
                            </pre>
                          </div>
                        ) : null}
                        {!item.metadataJson ? (
                          <div className="rounded-xl border border-slate-200 bg-stone-50 p-4 text-sm text-neutral-700">
                            No additional details recorded.
                          </div>
                        ) : null}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

