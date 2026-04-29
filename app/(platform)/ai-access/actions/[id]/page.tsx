import Link from "next/link";
import { notFound } from "next/navigation";
import { AiActionRequestStatus, AiMessageRole, type AiTool } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { approveAiActionRequestAction, rejectAiActionRequestAction } from "@/app/(platform)/ai-access/actions";
import { safeQuery } from "@/lib/server/safe-query";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ActionRequestDetail = {
  id: string;
  userId: string;
  conversationId: string;
  tool: AiTool;
  actionType: string;
  status: AiActionRequestStatus;
  input: unknown;
  result: unknown;
  riskLevel: string | null;
  approvalToken: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  conversation: {
    id: string;
    channel: string;
    externalThreadId: string;
    title: string;
    messages: Array<{
      id: string;
      role: AiMessageRole;
      content: string;
      createdAt: Date;
    }>;
  };
};

function firstString(value: string | string[] | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? value[0] ?? "" : value;
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

function statusClass(status: AiActionRequestStatus): string {
  if (status === AiActionRequestStatus.PENDING) return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === AiActionRequestStatus.APPROVED) return "border-slate-200 bg-slate-50 text-slate-700";
  if (status === AiActionRequestStatus.REJECTED) return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === AiActionRequestStatus.EXECUTED) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function prettyJSON(value: unknown): string {
  if (value == null) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function compactMessage(message: string): string {
  return message.trim().slice(0, 240);
}

export default async function AIAccessActionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireExecutive();
  const { id } = await params;
  const query = await searchParams;

  const request = await safeQuery<ActionRequestDetail | null>(async () => {
    return await prisma.aiActionRequest.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        userId: true,
        conversationId: true,
        tool: true,
        actionType: true,
        status: true,
        input: true,
        result: true,
        riskLevel: true,
        approvalToken: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        conversation: {
          select: {
            id: true,
            channel: true,
            externalThreadId: true,
            title: true,
            messages: {
              orderBy: { createdAt: "desc" },
              take: 12,
              select: {
                id: true,
                role: true,
                content: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
  }, null);

  if (!request) notFound();

  const conversationMessages = [...request.conversation.messages].reverse();
  const notice = firstString(query.notice);
  const message = firstString(query.message);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="AI Access"
        title="Action Request"
        subtitle={`Tool ${request.tool} · ${request.actionType}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/ai-access/actions">
              <ActionButton variant="secondary" size="sm">
                Back to Queue
              </ActionButton>
            </Link>
            <Link href="/ai-access">
              <ActionButton variant="secondary" size="sm">
                Overview
              </ActionButton>
            </Link>
          </div>
        }
      />

      {notice ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <p className="text-sm font-semibold">Update</p>
          <p className="mt-1 text-sm">{message || "Action request status has been updated."}</p>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Request profile" description="Action metadata and runtime policy">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-neutral-500">Request ID</p>
              <p className="font-mono text-neutral-900 break-all">{request.id}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Conversation</p>
              <p className="break-all text-neutral-900">{request.conversation.title}</p>
              <p className="text-neutral-600">
                {request.conversation.channel} / {request.conversation.externalThreadId}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Status</p>
              <p>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${statusClass(request.status)}`}>
                  {request.status}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Risk</p>
              <p className="font-mono text-neutral-900">{request.riskLevel ?? "UNKNOWN"}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Created</p>
              <p className="text-neutral-900">{formatDateTime(request.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Expires</p>
              <p className="text-neutral-900">{request.expiresAt ? formatDateTime(request.expiresAt) : "N/A"}</p>
            </div>
            {request.approvalToken ? (
              <div>
                <p className="text-xs text-neutral-500">Approval token</p>
                <p className="break-all font-mono text-sm text-neutral-900">{request.approvalToken}</p>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Control" description="Approve or reject the request">
          <div className="space-y-3">
            <p className="text-sm text-neutral-700">
              Confirm and execute this action only when the request is expected and the payload is safe.
            </p>
            {request.status === AiActionRequestStatus.PENDING ? (
              <div className="space-y-2">
                <form action={approveAiActionRequestAction}>
                  <input type="hidden" name="id" value={request.id} />
                  <ActionButton type="submit" className="w-full">
                    Approve & Execute
                  </ActionButton>
                </form>
                <form action={rejectAiActionRequestAction}>
                  <input type="hidden" name="id" value={request.id} />
                  <ActionButton type="submit" variant="danger" className="w-full">
                    Reject Request
                  </ActionButton>
                </form>
              </div>
            ) : (
              <p className="text-sm text-neutral-600">No manual action is available for this status.</p>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-neutral-700">
              <p className="font-semibold text-neutral-900">Latest system update</p>
              <p>{compactMessage(request.result ? prettyJSON(request.result) : "-")}</p>
              <p className="mt-2 text-neutral-500">Updated at {formatDateTime(request.updatedAt)}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Payload" description="Input and resulting output for review">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-neutral-500">Input</p>
              <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-neutral-950 p-3 text-xs text-green-100">
                {prettyJSON(request.input)}
              </pre>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Result</p>
              <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-neutral-950 p-3 text-xs text-green-100">
                {prettyJSON(request.result)}
              </pre>
            </div>
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Conversation context" description="Recent messages around this request">
        <div className="space-y-3">
          {conversationMessages.length === 0 ? (
            <p className="text-sm text-neutral-500">No related messages available.</p>
          ) : (
            conversationMessages.map((message) => (
              <article
                key={message.id}
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-neutral-800"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-neutral-900">{message.role}</p>
                  <p className="text-xs text-neutral-500">{formatDateTime(message.createdAt)}</p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-neutral-700">{compactMessage(message.content)}</p>
              </article>
            ))
          )}
        </div>
      </SectionCard>
    </main>
  );
}

