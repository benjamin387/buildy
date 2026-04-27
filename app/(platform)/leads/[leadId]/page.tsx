import Link from "next/link";
import { notFound } from "next/navigation";
import { AISalesStatus, MessageChannel } from "@prisma/client";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { requireLeadsModuleAccess } from "@/lib/leads/access";
import { getLeadByIdForViewer } from "@/lib/leads/service";
import { LeadStatusBadge } from "@/app/(platform)/leads/components/lead-status-badge";
import { prisma } from "@/lib/prisma";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { CopyLinkButton } from "@/app/(platform)/components/copy-link-button";
import { ActivityTimeline } from "@/app/components/timeline/activity-timeline";
import {
  addLeadActivityAction,
  convertLeadToProjectAction,
  convertLeadToQuotationAction,
  generateLeadAnalysisAction,
  generateLeadFollowUpDraftAction,
  generateLeadObjectionReplyDraftAction,
  markLeadLostAction,
  sendAISalesMessageDraftAction,
  updateAISalesInsightStatusAction,
  updateAISalesMessageDraftStatusAction,
} from "@/app/(platform)/leads/actions";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const session = await requireAuthenticatedSession();
  requireLeadsModuleAccess(session.user);

  const { leadId } = await params;
  const lead = await getLeadByIdForViewer({ viewer: session.user, leadId });
  if (!lead) notFound();

  const [insights, drafts, attachments, botSession] = await Promise.all([
    prisma.aISalesInsight.findMany({
      where: { leadId },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    }),
    prisma.aISalesMessageDraft.findMany({
      where: { leadId },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    }),
    prisma.leadAttachment
      .findMany({
        where: { leadId },
        orderBy: [{ createdAt: "desc" }],
        take: 30,
      })
      .catch(() => []),
    prisma.leadBotSession
      .findFirst({
        where: {
          payload: {
            path: ["leadId"],
            equals: leadId,
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      })
      .catch(() => null),
  ]);

  const leadQuality = insights.find((i) => i.insightType === "LEAD_QUALITY") ?? null;
  const requirementSummary = insights.find((i) => i.insightType === "REQUIREMENT_SUMMARY") ?? null;
  const nextAction = insights.find((i) => i.insightType === "NEXT_ACTION") ?? null;

  const canConvert = lead.status !== "CONVERTED" && lead.status !== "LOST" && !lead.convertedProjectId;
  const canEdit = true;
  const canQuoteWrite = session.user.permissions.includes("QUOTE_WRITE") && lead.status !== "LOST";

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/leads"
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <LeadStatusBadge status={lead.status} />
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {lead.leadNumber}
            </span>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Lead Detail
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {lead.customerName}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            {lead.customerEmail ?? "-"} · {lead.customerPhone ?? "-"} · Channel: {lead.source} · Marketing: {lead.marketingSource ?? "-"}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/leads/${leadId}/site-visits`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Site Visits
          </Link>

          {canEdit ? (
            <Link
              href={`/leads/${leadId}/edit`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Edit
            </Link>
          ) : null}

          {lead.convertedProjectId ? (
            <Link
              href={`/projects/${lead.convertedProjectId}`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Open Project
            </Link>
          ) : null}

          {canQuoteWrite ? (
            <form action={convertLeadToQuotationAction}>
              <input type="hidden" name="leadId" value={leadId} />
              <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                New Quotation
              </button>
            </form>
          ) : null}

          {canConvert ? (
            <form action={convertLeadToProjectAction}>
              <input type="hidden" name="leadId" value={leadId} />
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Convert to Project
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card title="Customer">
          <InfoRow label="Name" value={lead.customerName} />
          <InfoRow label="Email" value={lead.customerEmail ?? "-"} />
          <InfoRow label="Phone" value={lead.customerPhone ?? "-"} />
          <InfoRow label="Assigned Sales" value={lead.assignedSalesName ?? "-"} />
          <InfoRow label="Assigned Email" value={lead.assignedSalesEmail ?? "-"} />
        </Card>
        <Card title="Project">
          <InfoRow label="Address" value={lead.projectAddress} />
          <InfoRow label="Project Type" value={lead.projectType} />
          <InfoRow label="Property Category" value={lead.propertyCategory} />
          <InfoRow label="Residential Type" value={lead.residentialPropertyType ?? "-"} />
          <InfoRow label="Design Style" value={lead.preferredDesignStyle ?? "-"} />
        </Card>
        <Card title="Follow-up">
          <InfoRow label="Next follow-up" value={formatDate(lead.nextFollowUpAt)} />
          <InfoRow label="Created" value={formatDate(lead.createdAt)} />
          <InfoRow label="Updated" value={formatDate(lead.updatedAt)} />
          <InfoRow label="Converted" value={formatDate(lead.convertedAt)} />
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Intake Source">
          <InfoRow label="Channel" value={lead.source} />
          <InfoRow
            label="Submitted By"
            value={lead.submittedByUser ? (lead.submittedByUser.name ?? lead.submittedByUser.email) : "-"}
          />
          <InfoRow label="Submitted Email" value={lead.submittedByUser?.email ?? "-"} />
          <InfoRow
            label="Bot Session"
            value={botSession ? `${botSession.channel} · ${botSession.status} · step: ${botSession.currentStep}` : "-"}
          />
          {botSession ? (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Bot Payload</p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-neutral-800">
                {JSON.stringify(botSession.payload, null, 2)}
              </pre>
            </div>
          ) : null}
        </Card>

        <Card title="Attachments">
          {attachments.length === 0 ? (
            <p className="text-sm text-neutral-700">No attachments.</p>
          ) : (
            <div className="space-y-3">
              {attachments.map((a) => (
                <div key={a.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <p className="text-sm font-medium text-neutral-900">
                    {a.originalFileName ?? a.fileType}
                  </p>
                  <p className="mt-1 break-all text-xs text-neutral-600">
                    {a.fileUrl}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    {a.channel} · {formatDateTime(a.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section id="ai" className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm scroll-mt-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">AI Sales Assistant</p>
            <h2 className="mt-2 text-xl font-semibold text-neutral-950">Qualification & Follow-up</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Generates insights and message drafts for review (no auto-send).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form action={generateLeadAnalysisAction}>
              <input type="hidden" name="leadId" value={leadId} />
              <PendingSubmitButton pendingText="Analyzing...">Generate analysis</PendingSubmitButton>
            </form>
            <form action={generateLeadFollowUpDraftAction}>
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="channel" value={MessageChannel.WHATSAPP} />
              <PendingSubmitButton pendingText="Drafting...">WhatsApp follow-up</PendingSubmitButton>
            </form>
            <form action={generateLeadFollowUpDraftAction}>
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="channel" value={MessageChannel.EMAIL} />
              <PendingSubmitButton pendingText="Drafting...">Email follow-up</PendingSubmitButton>
            </form>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Lead Quality</p>
            {leadQuality ? (
              <>
                <p className="mt-2 text-sm font-semibold text-neutral-950">{leadQuality.title}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{leadQuality.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={updateAISalesInsightStatusAction}>
                    <input type="hidden" name="id" value={leadQuality.id} />
                    <input type="hidden" name="leadId" value={leadId} />
                    <input type="hidden" name="status" value={AISalesStatus.REVIEWED} />
                    <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                      Mark reviewed
                    </button>
                  </form>
                  <form action={updateAISalesInsightStatusAction}>
                    <input type="hidden" name="id" value={leadQuality.id} />
                    <input type="hidden" name="leadId" value={leadId} />
                    <input type="hidden" name="status" value={AISalesStatus.DISMISSED} />
                    <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                      Dismiss
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-neutral-700">No AI analysis yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Requirement Summary</p>
            {requirementSummary ? (
              <>
                <p className="mt-2 text-sm font-semibold text-neutral-950">{requirementSummary.title}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{requirementSummary.summary}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-neutral-700">No AI summary yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Next Action</p>
            {nextAction ? (
              <>
                <p className="mt-2 text-sm font-semibold text-neutral-950">{nextAction.title}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{nextAction.recommendation ?? nextAction.summary}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-neutral-700">No AI next action yet.</p>
            )}

            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Objection handling</p>
              <form action={generateLeadObjectionReplyDraftAction} className="mt-3 grid gap-2">
                <input type="hidden" name="leadId" value={leadId} />
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Channel</span>
                  <select
                    name="channel"
                    defaultValue={MessageChannel.WHATSAPP}
                    className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                  >
                    <option value={MessageChannel.WHATSAPP}>WhatsApp</option>
                    <option value={MessageChannel.EMAIL}>Email</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Client objection</span>
                  <textarea
                    name="objectionText"
                    rows={3}
                    required
                    className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                    placeholder='e.g. "Your quote is too expensive"'
                  />
                </label>
                <div className="flex justify-end">
                  <PendingSubmitButton pendingText="Drafting...">Generate reply</PendingSubmitButton>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200">
          <div className="border-b border-neutral-200 bg-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">AI Message Drafts</p>
            <p className="mt-1 text-sm text-neutral-600">Approve first, then send via Email/WhatsApp.</p>
          </div>
          {drafts.length === 0 ? (
            <div className="px-4 py-6 text-sm text-neutral-600">No message drafts yet.</div>
          ) : (
            <div className="divide-y divide-neutral-200 bg-white">
              {drafts.slice(0, 5).map((d) => (
                <div key={d.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">
                        {d.purpose} · {d.channel} · {d.status}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        To: {d.recipientName ?? "-"} · {d.recipientContact ?? "-"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyLinkButton text={d.messageBody} label="Copy message" />
                      {d.status === AISalesStatus.APPROVED ? (
                        <form action={sendAISalesMessageDraftAction}>
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="leadId" value={leadId} />
                          <input type="hidden" name="returnTo" value={`/leads/${leadId}#ai`} />
                          <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                            Send
                          </button>
                        </form>
                      ) : null}
                      <form action={updateAISalesMessageDraftStatusAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="leadId" value={leadId} />
                        <input type="hidden" name="status" value={AISalesStatus.APPROVED} />
                        <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                          Approve
                        </button>
                      </form>
                      <form action={updateAISalesMessageDraftStatusAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="leadId" value={leadId} />
                        <input type="hidden" name="status" value={AISalesStatus.DISMISSED} />
                        <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </div>
                  <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-800">
                    {d.messageBody}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Requirements / Notes</h2>
          <div className="mt-4 space-y-4 text-sm">
            <Block title="Requirement Summary" value={lead.requirementSummary} />
            <Block title="Notes" value={lead.notes} />
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Log Activity</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Add call, WhatsApp, email, site visit notes and follow-up reminders.
          </p>

          <div className="mt-5 space-y-4">
            <QuickActivity leadId={leadId} activityType="CALL" channel="PHONE" label="Call note" placeholder="Summary of call" />
            <QuickActivity leadId={leadId} activityType="WHATSAPP" channel="WHATSAPP" label="WhatsApp note" placeholder="Summary of WhatsApp" />
            <QuickActivity leadId={leadId} activityType="EMAIL" channel="EMAIL" label="Email note" placeholder="Summary of email" />
            <QuickActivity leadId={leadId} activityType="SITE_VISIT" channel="MEETING" label="Site visit note" placeholder="Site visit summary" />

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Follow-up Reminder
              </p>
              <form action={addLeadActivityAction} className="mt-3 grid gap-3 sm:grid-cols-6">
                <input type="hidden" name="leadId" value={leadId} />
                <input type="hidden" name="activityType" value="FOLLOW_UP" />
                <input type="hidden" name="channel" value="OTHER" />
                <label className="grid gap-2 text-sm sm:col-span-2">
                  <span className="font-medium text-neutral-800">Follow-up date</span>
                  <input
                    name="followUpAt"
                    type="date"
                    defaultValue={todayIsoDate()}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                  />
                </label>
                <label className="grid gap-2 text-sm sm:col-span-4">
                  <span className="font-medium text-neutral-800">Summary</span>
                  <input
                    name="summary"
                    required
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="e.g. Follow up on budget confirmation"
                  />
                </label>
                <label className="grid gap-2 text-sm sm:col-span-6">
                  <span className="font-medium text-neutral-800">Notes (optional)</span>
                  <textarea
                    name="notes"
                    rows={2}
                    className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="Optional notes"
                  />
                </label>
                <div className="flex justify-end sm:col-span-6">
                  <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                    Add Follow-up
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
                Mark Lost
              </p>
              <form action={markLeadLostAction} className="mt-3 grid gap-3 sm:grid-cols-6">
                <input type="hidden" name="leadId" value={leadId} />
                <label className="grid gap-2 text-sm sm:col-span-6">
                  <span className="font-medium text-red-800">Reason</span>
                  <input
                    name="reason"
                    required
                    className="h-11 rounded-xl border border-red-200 bg-white px-3 outline-none ring-red-200 focus:ring-2"
                    placeholder="e.g. Out of budget, went with competitor, no response"
                  />
                </label>
                <div className="flex justify-end sm:col-span-6">
                  <button className="inline-flex h-11 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-600">
                    Mark Lost
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Activity Timeline</h2>
        </div>

        {lead.activities.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No activities yet.</div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {lead.activities.map((a) => (
              <div key={a.id} className="px-6 py-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      {a.activityType} · {a.channel} · {a.summary}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {formatDateTime(a.createdAt)} · {a.createdBy}
                      {a.followUpAt ? ` · Follow-up ${formatDate(a.followUpAt)}` : ""}
                    </p>
                  </div>
                </div>
                {a.notes ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                    {a.notes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <ActivityTimeline
        entityType="Lead"
        entityId={leadId}
        take={25}
        title="Lead Timeline"
        description="Status changes, follow-ups, bot intake and conversion steps."
      />
    </main>
  );
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">{props.title}</h2>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function InfoRow(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2 text-sm">
      <span className="text-neutral-600">{props.label}</span>
      <span className="font-medium text-neutral-950">{props.value}</span>
    </div>
  );
}

function Block(props: { title: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-neutral-800">{props.value ?? "-"}</p>
    </div>
  );
}

function QuickActivity(props: {
  leadId: string;
  activityType: "CALL" | "WHATSAPP" | "EMAIL" | "SITE_VISIT" | "NOTE";
  channel: "PHONE" | "WHATSAPP" | "EMAIL" | "MEETING" | "OTHER";
  label: string;
  placeholder: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.label}
      </p>
      <form action={addLeadActivityAction} className="mt-3 grid gap-3 sm:grid-cols-6">
        <input type="hidden" name="leadId" value={props.leadId} />
        <input type="hidden" name="activityType" value={props.activityType} />
        <input type="hidden" name="channel" value={props.channel} />
        <label className="grid gap-2 text-sm sm:col-span-6">
          <span className="font-medium text-neutral-800">Summary</span>
          <input
            name="summary"
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            placeholder={props.placeholder}
          />
        </label>
        <label className="grid gap-2 text-sm sm:col-span-6">
          <span className="font-medium text-neutral-800">Notes (optional)</span>
          <textarea
            name="notes"
            rows={2}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
            placeholder="Optional details"
          />
        </label>
        <div className="flex justify-end sm:col-span-6">
          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
