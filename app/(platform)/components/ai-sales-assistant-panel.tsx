import "server-only";

import Link from "next/link";
import { AISalesStatus, MessageChannel } from "@prisma/client";
import type { AISalesInsight, AISalesMessageDraft } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { CopyLinkButton } from "@/app/(platform)/components/copy-link-button";
import {
  generateQuotationPitchAction,
  generateUpsellPitchAction,
  updateAISalesInsightStatusAction,
  updateAISalesMessageDraftStatusAction,
} from "@/app/(platform)/sales/assistant/actions";

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

type Mode = "PROJECT" | "QUOTATION";

export async function AISalesAssistantPanel(props: {
  projectId: string;
  quotationId?: string | null;
  returnTo: string;
  mode: Mode;
}) {
  const prismaAny = prisma as unknown as Record<string, any>;
  const hasAISales =
    typeof prismaAny.aISalesInsight?.findMany === "function" &&
    typeof prismaAny.aISalesMessageDraft?.findMany === "function";

  const [insights, drafts, latestQuotation, latestBrief] = await Promise.all([
    hasAISales
      ? (prismaAny.aISalesInsight.findMany({
          where: {
            projectId: props.projectId,
            insightType: { in: ["PRICING", "UPSELL", "NEXT_ACTION", "OBJECTION_HANDLING"] },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 12,
        }) as Promise<AISalesInsight[]>)
      : Promise.resolve<AISalesInsight[]>([]),
    hasAISales
      ? (prismaAny.aISalesMessageDraft.findMany({
          where: {
            projectId: props.projectId,
            ...(props.mode === "QUOTATION"
              ? { purpose: { in: ["QUOTATION_PITCH", "UPSELL_PITCH"] } }
              : {}),
          },
          orderBy: [{ createdAt: "desc" }],
          take: 12,
        }) as Promise<AISalesMessageDraft[]>)
      : Promise.resolve<AISalesMessageDraft[]>([]),
    props.quotationId
      ? prisma.quotation.findUnique({
          where: { id: props.quotationId },
          select: { id: true },
        })
      : prisma.quotation.findFirst({
          where: { projectId: props.projectId, isLatest: true },
          orderBy: [{ createdAt: "desc" }],
          select: { id: true },
        }),
    prisma.designBrief.findFirst({
      where: { projectId: props.projectId },
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true },
    }),
  ]);

  const quotationId = props.quotationId ?? latestQuotation?.id ?? "";
  const designBriefId = latestBrief?.id ?? "";

  return (
    <section
      id="ai-sales"
      className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm scroll-mt-24"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            AI Sales Assistant
          </p>
          <h2 className="mt-2 text-xl font-semibold text-neutral-950">Pitches & Closing</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Generates drafts and insights for review only. Use Messaging to send when ready.
          </p>
          {!hasAISales ? (
            <p className="mt-3 text-sm text-red-700">
              AI Sales Assistant tables are not available in the running server. If you just updated Prisma, restart the dev server.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form action={generateQuotationPitchAction} className="flex items-end gap-2">
            <input type="hidden" name="projectId" value={props.projectId} />
            <input type="hidden" name="quotationId" value={quotationId} />
            <input type="hidden" name="returnTo" value={props.returnTo} />
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Channel
              <select
                name="channel"
                defaultValue={MessageChannel.EMAIL}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 outline-none ring-neutral-400 focus:ring-2"
              >
                <option value={MessageChannel.EMAIL}>Email</option>
                <option value={MessageChannel.WHATSAPP}>WhatsApp</option>
              </select>
            </label>
            <PendingSubmitButton pendingText="Generating...">
              Generate quotation pitch
            </PendingSubmitButton>
          </form>

          <form action={generateUpsellPitchAction} className="flex items-end gap-2">
            <input type="hidden" name="projectId" value={props.projectId} />
            <input type="hidden" name="designBriefId" value={designBriefId} />
            <input type="hidden" name="returnTo" value={props.returnTo} />
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Channel
              <select
                name="channel"
                defaultValue={MessageChannel.WHATSAPP}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 outline-none ring-neutral-400 focus:ring-2"
              >
                <option value={MessageChannel.WHATSAPP}>WhatsApp</option>
                <option value={MessageChannel.EMAIL}>Email</option>
              </select>
            </label>
            <PendingSubmitButton pendingText="Generating..." className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60">
              Generate upsell pitch
            </PendingSubmitButton>
          </form>

          <Link
            href="/sales/assistant"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Open Sales Assistant
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 bg-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">Insights</p>
          </div>
          {insights.length === 0 ? (
            <div className="px-4 py-5 text-sm text-neutral-600">No project AI insights yet.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {insights.slice(0, 8).map((i) => (
                <div key={i.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">
                        {i.insightType} · {i.status}
                      </p>
                      <p className="mt-1 text-sm text-neutral-800">{i.title}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                        {i.summary}
                      </p>
                      {i.recommendation ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                          <span className="font-semibold text-neutral-900">Recommendation:</span>{" "}
                          {i.recommendation}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-neutral-500">
                        {formatDateTime(i.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <form action={updateAISalesInsightStatusAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="status" value={AISalesStatus.REVIEWED} />
                        <input type="hidden" name="returnTo" value={props.returnTo} />
                        <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Mark reviewed
                        </button>
                      </form>
                      <form action={updateAISalesInsightStatusAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="status" value={AISalesStatus.DISMISSED} />
                        <input type="hidden" name="returnTo" value={props.returnTo} />
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
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 bg-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">Message Drafts</p>
            <p className="mt-1 text-xs text-neutral-600">
              Copy and approve. Sending happens in Messaging.
            </p>
          </div>
          {drafts.length === 0 ? (
            <div className="px-4 py-5 text-sm text-neutral-600">No AI message drafts yet.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {drafts.slice(0, 6).map((d) => (
                <div key={d.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">
                        {d.purpose} · {d.channel} · {d.status}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        To: {d.recipientName ?? "-"} · {d.recipientContact ?? "-"} ·{" "}
                        {formatDateTime(d.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyLinkButton text={d.messageBody} label="Copy message" />
                      <form action={updateAISalesMessageDraftStatusAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="status" value={AISalesStatus.APPROVED} />
                        <input type="hidden" name="returnTo" value={props.returnTo} />
                        <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                          Approve
                        </button>
                      </form>
                      <form action={updateAISalesMessageDraftStatusAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="status" value={AISalesStatus.DISMISSED} />
                        <input type="hidden" name="returnTo" value={props.returnTo} />
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
        </div>
      </div>
    </section>
  );
}
