import Link from "next/link";
import { AISalesStatus, Permission } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { CopyLinkButton } from "@/app/(platform)/components/copy-link-button";
import {
  updateAISalesInsightStatusAction,
  updateAISalesMessageDraftStatusAction,
} from "@/app/(platform)/sales/assistant/actions";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function scoreFromTitle(title: string): number {
  const m = title.match(/(\d{1,3})\s*\/\s*100/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function MetricCard(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
        {props.value}
      </p>
      {props.hint ? <p className="mt-2 text-sm text-neutral-600">{props.hint}</p> : null}
    </div>
  );
}

export default async function SalesAssistantPage() {
  await requirePermission({ permission: Permission.PROJECT_READ });

  const prismaAny = prisma as unknown as Record<string, any>;
  const hasAISales =
    typeof prismaAny.aISalesMessageDraft?.findMany === "function" &&
    typeof prismaAny.aISalesInsight?.findMany === "function";

  if (!hasAISales) {
    return (
      <main className="space-y-6">
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Sales</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            AI Sales Assistant
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-700">
            AI Sales Assistant tables are not available in the running server.
            If you just updated Prisma schema/migrations, restart the dev server after running Prisma generate.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Back to Dashboard
            </Link>
            <Link
              href="/leads"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Open Leads
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const nowMs = new Date().getTime();
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(nowMs - 3 * 24 * 60 * 60 * 1000);

  type DraftRow = Prisma.AISalesMessageDraftGetPayload<{
    include: {
      lead: { select: { id: true; leadNumber: true; customerName: true } };
      project: { select: { id: true; projectCode: true; name: true } };
    };
  }>;

  type InsightRow = Prisma.AISalesInsightGetPayload<{
    include: {
      lead: { select: { id: true; leadNumber: true; customerName: true } };
      project: { select: { id: true; projectCode: true; name: true } };
    };
  }>;

  type LeadQualityInsightRow = Prisma.AISalesInsightGetPayload<{
    include: {
      lead: { select: { id: true; leadNumber: true; customerName: true; status: true } };
    };
  }>;

  const pendingDraftsPromise: Promise<DraftRow[]> = prismaAny.aISalesMessageDraft.findMany({
    where: { status: { in: [AISalesStatus.DRAFT, AISalesStatus.REVIEWED] } },
    include: {
      lead: { select: { id: true, leadNumber: true, customerName: true } },
      project: { select: { id: true, projectCode: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 30,
  }) as Promise<DraftRow[]>;

  const pendingInsightsPromise: Promise<InsightRow[]> = prismaAny.aISalesInsight.findMany({
    where: { status: { in: [AISalesStatus.DRAFT, AISalesStatus.REVIEWED] } },
    include: {
      lead: { select: { id: true, leadNumber: true, customerName: true } },
      project: { select: { id: true, projectCode: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 40,
  }) as Promise<InsightRow[]>;

  const leadQualityInsightsPromise: Promise<LeadQualityInsightRow[]> = prismaAny.aISalesInsight.findMany({
    where: { insightType: "LEAD_QUALITY", leadId: { not: null } },
    include: { lead: { select: { id: true, leadNumber: true, customerName: true, status: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  }) as Promise<LeadQualityInsightRow[]>;

  const [
    pendingDrafts,
    pendingInsights,
    followUpsDue,
    staleQuotations,
    upsellOpps,
    leadQualityInsights,
  ] = await Promise.all([
    pendingDraftsPromise,
    pendingInsightsPromise,
    prisma.lead.findMany({
      where: {
        status: { notIn: ["CONVERTED", "LOST"] },
        nextFollowUpAt: { not: null, lte: todayEnd },
      },
      orderBy: [{ nextFollowUpAt: "asc" }],
      take: 20,
    }),
    prisma.quotation.findMany({
      where: {
        status: "SENT",
        updatedAt: { lte: threeDaysAgo },
      },
      include: { project: { select: { id: true, projectCode: true, name: true } } },
      orderBy: [{ updatedAt: "asc" }],
      take: 15,
    }),
    prisma.upsellRecommendation.findMany({
      where: {
        status: "SUGGESTED",
        createdAt: { gte: sevenDaysAgo },
      },
      include: { project: { select: { id: true, projectCode: true, name: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 15,
    }),
    leadQualityInsightsPromise,
  ]);

  const latestQualityByLead = new Map<
    string,
    { leadId: string; leadNumber: string; customerName: string; status: string; score: number; createdAt: Date }
  >();
  for (const i of leadQualityInsights) {
    if (!i.leadId || !i.lead) continue;
    if (i.lead.status === "CONVERTED" || i.lead.status === "LOST") continue;
    if (latestQualityByLead.has(i.leadId)) continue;
    latestQualityByLead.set(i.leadId, {
      leadId: i.lead.id,
      leadNumber: i.lead.leadNumber,
      customerName: i.lead.customerName,
      status: i.lead.status,
      score: scoreFromTitle(i.title),
      createdAt: i.createdAt,
    });
  }

  const hotLeads = [...latestQualityByLead.values()]
    .filter((l) => l.score >= 70)
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);

  const overdueFollowUps = followUpsDue.filter((l) => (l.nextFollowUpAt ? l.nextFollowUpAt < todayStart : false));
  const dueToday = followUpsDue.filter((l) => (l.nextFollowUpAt ? l.nextFollowUpAt >= todayStart : false));

  return (
    <main className="space-y-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Sales</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            AI Sales Assistant
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-700">
            Review AI-generated insights and message drafts, prioritize follow-ups, and keep quotation momentum without auto-sending.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/leads"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Open Leads
          </Link>
          <Link
            href="/projects"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Open Projects
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Hot Leads" value={`${hotLeads.length}`} hint="Latest quality score ≥ 70" />
        <MetricCard
          title="Follow-ups Due"
          value={`${followUpsDue.length}`}
          hint={`${overdueFollowUps.length} overdue · ${dueToday.length} due today`}
        />
        <MetricCard
          title="Draft Messages"
          value={`${pendingDrafts.length}`}
          hint="AI drafts pending review/approval"
        />
        <MetricCard
          title="Quote Follow-ups"
          value={`${staleQuotations.length}`}
          hint="Quotations SENT and idle > 3 days"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Hot Leads</h2>
            <p className="mt-1 text-sm text-neutral-600">Prioritize high-quality leads for follow-up.</p>
          </div>
          {hotLeads.length === 0 ? (
            <div className="px-6 py-6 text-sm text-neutral-600">
              No hot leads yet. Generate analysis inside a lead to populate this list.
            </div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {hotLeads.map((l) => (
                <div key={l.leadId} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Link href={`/leads/${l.leadId}`} className="text-sm font-semibold text-neutral-950 hover:underline">
                        {l.leadNumber} · {l.customerName}
                      </Link>
                      <p className="mt-1 text-xs text-neutral-500">Status: {l.status} · Score: {l.score}/100</p>
                    </div>
                    <Link
                      href={`/leads/${l.leadId}#ai`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                    >
                      Open AI →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Follow-ups</h2>
            <p className="mt-1 text-sm text-neutral-600">Leads with follow-up dates due today or earlier.</p>
          </div>
          {followUpsDue.length === 0 ? (
            <div className="px-6 py-6 text-sm text-neutral-600">No follow-ups due.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {followUpsDue.slice(0, 12).map((l) => (
                <div key={l.id} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Link href={`/leads/${l.id}`} className="text-sm font-semibold text-neutral-950 hover:underline">
                        {l.leadNumber} · {l.customerName}
                      </Link>
                      <p className="mt-1 text-xs text-neutral-500">
                        Next follow-up: {formatDateTime(l.nextFollowUpAt)} · Status: {l.status}
                      </p>
                    </div>
                    <Link
                      href={`/leads/${l.id}`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                    >
                      Open →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">AI Insights Queue</h2>
            <p className="mt-1 text-sm text-neutral-600">Latest insights needing review.</p>
          </div>
          {pendingInsights.length === 0 ? (
            <div className="px-6 py-6 text-sm text-neutral-600">No pending insights.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {pendingInsights.slice(0, 10).map((i) => (
                <div key={i.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                        {i.insightType} · {i.status}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-neutral-950">{i.title}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{i.summary}</p>
                      <p className="mt-2 text-xs text-neutral-500">
                        {i.lead ? (
                          <>
                            Lead:{" "}
                            <Link href={`/leads/${i.lead.id}`} className="font-medium text-neutral-900 hover:underline">
                              {i.lead.leadNumber} · {i.lead.customerName}
                            </Link>
                          </>
                        ) : i.project ? (
                          <>
                            Project:{" "}
                            <Link href={`/projects/${i.project.id}`} className="font-medium text-neutral-900 hover:underline">
                              {i.project.projectCode ? `${i.project.projectCode} · ` : ""}
                              {i.project.name}
                            </Link>
                          </>
                        ) : (
                          "Unlinked"
                        )}{" "}
                        · {formatDateTime(i.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <form action={updateAISalesInsightStatusAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="status" value={AISalesStatus.REVIEWED} />
                        <input type="hidden" name="returnTo" value="/sales/assistant" />
                        <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Reviewed
                        </button>
                      </form>
                      <form action={updateAISalesInsightStatusAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="status" value={AISalesStatus.DISMISSED} />
                        <input type="hidden" name="returnTo" value="/sales/assistant" />
                        <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Message Drafts Pending Approval</h2>
            <p className="mt-1 text-sm text-neutral-600">AI drafts only; sending happens via Messaging.</p>
          </div>
          {pendingDrafts.length === 0 ? (
            <div className="px-6 py-6 text-sm text-neutral-600">No pending drafts.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {pendingDrafts.slice(0, 8).map((d) => (
                <div key={d.id} className="px-6 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">
                        {d.purpose} · {d.channel} · {d.status}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        To: {d.recipientName ?? "-"} · {d.recipientContact ?? "-"} · {formatDateTime(d.createdAt)}
                      </p>
                      <p className="mt-2 text-xs text-neutral-500">
                        {d.lead ? (
                          <>
                            Lead:{" "}
                            <Link href={`/leads/${d.lead.id}`} className="font-medium text-neutral-900 hover:underline">
                              {d.lead.leadNumber} · {d.lead.customerName}
                            </Link>
                          </>
                        ) : d.project ? (
                          <>
                            Project:{" "}
                            <Link href={`/projects/${d.project.id}`} className="font-medium text-neutral-900 hover:underline">
                              {d.project.projectCode ? `${d.project.projectCode} · ` : ""}
                              {d.project.name}
                            </Link>
                          </>
                        ) : (
                          "Unlinked"
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyLinkButton text={d.messageBody} label="Copy" />
                      <form action={updateAISalesMessageDraftStatusAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="status" value={AISalesStatus.APPROVED} />
                        <input type="hidden" name="returnTo" value="/sales/assistant" />
                        <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                          Approve
                        </button>
                      </form>
                      <form action={updateAISalesMessageDraftStatusAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="status" value={AISalesStatus.DISMISSED} />
                        <input type="hidden" name="returnTo" value="/sales/assistant" />
                        <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </div>
                  <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs leading-5 text-neutral-800">
                    {d.messageBody}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Quotation Follow-up Needed</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Quotations marked SENT and idle (updated) for more than 3 days.
            </p>
          </div>
          {staleQuotations.length === 0 ? (
            <div className="px-6 py-6 text-sm text-neutral-600">No stale quotations detected.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {staleQuotations.map((q) => (
                <div key={q.id} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Link
                        href={`/projects/${q.projectId}/quotations/${q.id}`}
                        className="text-sm font-semibold text-neutral-950 hover:underline"
                      >
                        {q.quotationNumber} · V{q.version}
                      </Link>
                      <p className="mt-1 text-xs text-neutral-500">
                        Project:{" "}
                        <Link href={`/projects/${q.projectId}`} className="font-medium text-neutral-900 hover:underline">
                          {q.project.projectCode ? `${q.project.projectCode} · ` : ""}
                          {q.project.name}
                        </Link>{" "}
                        · Updated {formatDateTime(q.updatedAt)}
                      </p>
                    </div>
                    <Link
                      href={`/projects/${q.projectId}/quotations/${q.id}#ai-sales`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                    >
                      Draft pitch →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Upsell Opportunities</h2>
            <p className="mt-1 text-sm text-neutral-600">Suggested upsells created in the last 7 days.</p>
          </div>
          {upsellOpps.length === 0 ? (
            <div className="px-6 py-6 text-sm text-neutral-600">No upsell opportunities yet.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {upsellOpps.map((u) => (
                <div key={u.id} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">{u.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Project:{" "}
                        <Link href={`/projects/${u.projectId}`} className="font-medium text-neutral-900 hover:underline">
                          {u.project.projectCode ? `${u.project.projectCode} · ` : ""}
                          {u.project.name}
                        </Link>{" "}
                        · Priority: {u.priority} · +{formatCurrency(Number(u.estimatedRevenueIncrease))}
                      </p>
                    </div>
                    <Link
                      href={`/projects/${u.projectId}#ai-sales`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                    >
                      Draft pitch →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
