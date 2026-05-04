import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AiActionRequestStatus } from "@prisma/client";
import { requireExecutive } from "@/lib/rbac/executive";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { safeQuery } from "@/lib/server/safe-query";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type NoticeType = "info" | "success" | "error";

type NoticeBanner = {
  type: NoticeType;
  title: string;
  message: string;
};

type UiAiToolPermission = {
  tool: string;
  isEnabled: boolean;
  requiresApproval: boolean;
};

function firstString(value: string | string[] | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function parseNotice(params: Record<string, string | string[] | undefined>): NoticeBanner | null {
  const notice = firstString(params.notice);
  const message = firstString(params.message);
  if (!notice && !message) return null;

  if (notice === "channel_revoked") {
    return {
      type: "success",
      title: "Pairing revoked",
      message: message || "Channel was revoked successfully.",
    };
  }

  if (notice === "permissions_saved") {
    return {
      type: "success",
      title: "Permissions saved",
      message: message || "AI tool permissions were updated.",
    };
  }

  return {
    type: "info",
    title: "Status update",
    message: message || notice || "Action completed.",
  };
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

function toolStatusLabel(row: UiAiToolPermission): string {
  const base = row.isEnabled ? "Enabled" : "Disabled";
  if (!row.isEnabled) return base;
  return row.requiresApproval ? `${base} · Needs approval` : `${base} · Auto`;
}

function toolLabel(tool: string): string {
  return tool
    .toLowerCase()
    .split("_")
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}

export default async function AIxAccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireExecutive();
  const params = await searchParams;
  const notice = parseNotice(params);

  const [channels, permissions, pendingActions, recentLogs, conversations] = await Promise.all([
    safeQuery(() => prisma.aiUserChannel.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }],
    }), [] as Array<{
      id: string;
      channel: string;
      externalUserId: string;
      displayName: string | null;
      phoneNumber: string | null;
      username: string | null;
      isVerified: boolean;
      pairedAt: Date | null;
      lastSeenAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>),
    safeQuery(() => prisma.aiToolPermission.findMany({
      where: { userId: user.id },
      orderBy: { tool: "asc" },
    }), [] as Array<UiAiToolPermission>),
    safeQuery(async () => prisma.aiActionRequest.findMany({
      where: { userId: user.id, status: AiActionRequestStatus.PENDING },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        tool: true,
        actionType: true,
        createdAt: true,
        status: true,
        riskLevel: true,
      },
    }), []),
    safeQuery(async () => prisma.aiAuditLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        tool: true,
        action: true,
        status: true,
        inputSummary: true,
        createdAt: true,
        channel: true,
      },
    }), []),
    safeQuery(async () => prisma.aiConversation.findMany({
      where: { userId: user.id },
      orderBy: { lastMessageAt: "desc" },
      take: 8,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { role: true, content: true, createdAt: true },
        },
      },
    }), [] as Array<{
      id: string;
      title: string;
      channel: string;
      externalThreadId: string;
      lastMessageAt: Date;
      updatedAt: Date;
      messages: Array<{ role: string; content: string; createdAt: Date }>;
    }>),
  ]);

  const safePermissions = permissions.map((permission) => ({
    ...permission,
    tool: toolLabel(permission.tool),
    statusText: toolStatusLabel(permission),
  }));

  const pairedCount = channels.filter((channel) => channel.isVerified).length;

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Platform / AI"
        title="AI Access Overview"
        subtitle="Pair Telegram and WhatsApp identities, configure tool permissions, review pending approvals, and inspect audit activity."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/ai-access/channels"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
            >
              Channels
            </Link>
            <Link
              href="/ai-access/permissions"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
            >
              Permissions
            </Link>
            <Link
              href="/ai-access/actions"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Pending Actions
            </Link>
          </div>
        }
      />

      {notice ? (
        <section
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : notice.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
        >
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-1">{notice.message}</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <SectionCard title="Paired Channels" description="Connected chat channels for AI access">
          <p className="text-3xl font-semibold text-neutral-950">{pairedCount}</p>
          <p className="mt-1 text-sm text-neutral-600">of {channels.length} configured devices.</p>
        </SectionCard>
        <SectionCard title="Enabled Tools" description="Tools active for this account">
          <p className="text-3xl font-semibold text-neutral-950">{safePermissions.filter((permission) => permission.isEnabled).length}</p>
          <p className="mt-1 text-sm text-neutral-600">Tool permissions with execution enabled.</p>
        </SectionCard>
        <SectionCard title="Approval Pending" description="Tool actions waiting on user consent">
          <p className="text-3xl font-semibold text-neutral-950">{pendingActions.length}</p>
          <p className="mt-1 text-sm text-neutral-600">High-risk or sensitive requests.</p>
        </SectionCard>
        <SectionCard title="Recent Audit" description="Latest logged events">
          <p className="text-3xl font-semibold text-neutral-950">{recentLogs.length}</p>
          <p className="mt-1 text-sm text-neutral-600">Records from tool activity and approvals.</p>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Channel pairing cards" description="Current Telegram and WhatsApp binding status.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-neutral-600">
                <tr>
                  <th className="pb-2 text-left font-semibold">Channel</th>
                  <th className="pb-2 text-left font-semibold">Status</th>
                  <th className="pb-2 text-left font-semibold">Identity</th>
                  <th className="pb-2 text-right font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {channels.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-neutral-500">
                      No channels configured.
                    </td>
                  </tr>
                ) : (
                  channels.map((channel) => (
                    <tr key={channel.id} className="border-t border-slate-200">
                      <td className="py-3 font-medium text-neutral-900">{channel.channel}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            channel.isVerified
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {channel.isVerified ? "Paired" : "Unpaired"}
                        </span>
                      </td>
                      <td className="py-3 text-neutral-700">
                        {channel.displayName || channel.username || channel.phoneNumber || channel.externalUserId || "—"}
                      </td>
                      <td className="py-3 text-right text-neutral-600">{formatDateTime(channel.lastSeenAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Permission matrix" description="Tool access status and approval policy for this user profile.">
          <div className="space-y-3">
            {safePermissions.length === 0 ? (
              <p className="text-sm text-neutral-500">No permission rows found yet.</p>
            ) : (
              safePermissions.map((permission) => (
                <div
                  key={permission.tool}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-neutral-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">{permission.tool}</p>
                    <p className="text-xs text-neutral-600">{permission.statusText}</p>
                  </div>
                  <Link
                    href="/ai-access/permissions"
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-neutral-300 px-3 text-xs font-semibold text-neutral-800 hover:bg-white"
                  >
                    Edit
                  </Link>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Pending approval queue" description="Open requests requiring explicit user consent">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-neutral-600">
                <tr>
                  <th className="pb-2 text-left font-semibold">Created</th>
                  <th className="pb-2 text-left font-semibold">Tool</th>
                  <th className="pb-2 text-left font-semibold">Action</th>
                  <th className="pb-2 text-right font-semibold">Risk</th>
                </tr>
              </thead>
              <tbody>
                {pendingActions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-neutral-500">
                      No pending approvals.
                    </td>
                  </tr>
                ) : (
                  pendingActions.map((request) => (
                    <tr key={request.id} className="border-t border-slate-200">
                      <td className="py-3 text-neutral-700">{formatDateTime(request.createdAt)}</td>
                      <td className="py-3 font-medium text-neutral-900">{request.tool}</td>
                      <td className="py-3">
                        <Link
                          href={`/ai-access/actions/${request.id}`}
                          className="text-sm font-semibold text-neutral-900 underline underline-offset-2 hover:text-neutral-600"
                        >
                          {request.actionType}
                        </Link>
                      </td>
                      <td className="py-3 text-right">
                        <span className="inline-flex rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-neutral-700">
                          {request.riskLevel ?? "UNKNOWN"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Audit log" description="Latest AI access audit entries">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-neutral-600">
                <tr>
                  <th className="pb-2 text-left font-semibold">Created</th>
                  <th className="pb-2 text-left font-semibold">Channel</th>
                  <th className="pb-2 text-left font-semibold">Tool</th>
                  <th className="pb-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-neutral-500">
                      No audit logs yet.
                    </td>
                  </tr>
                ) : (
                  recentLogs.map((log) => (
                    <tr key={log.id} className="border-t border-slate-200">
                      <td className="py-3 text-neutral-700">{formatDateTime(log.createdAt)}</td>
                      <td className="py-3 text-neutral-700">{log.channel}</td>
                      <td className="py-3 text-neutral-900">{log.tool}</td>
                      <td className="py-3 text-neutral-700">
                        <span className="inline-flex rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-neutral-700">
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="Conversation history"
        description="Recent thread activity from all paired channels."
      >
        {conversations.length === 0 ? (
          <p className="text-sm text-neutral-500">No conversation history yet.</p>
        ) : (
          <div className="space-y-3">
            {conversations.map((conversation) => {
              const lastMessage = conversation.messages[0];
              return (
                <article key={conversation.id} className="rounded-xl border border-slate-200 bg-neutral-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-neutral-950">{conversation.title}</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {conversation.channel} / Thread {conversation.externalThreadId}
                      </p>
                    </div>
                    <p className="text-xs text-neutral-500">{formatDateTime(conversation.lastMessageAt)}</p>
                  </div>
                  {lastMessage ? (
                    <p className="mt-3 text-sm text-neutral-700">
                      <span className="font-semibold">{lastMessage.role}:</span> {lastMessage.content.slice(0, 180)}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-neutral-500">No messages in this thread.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </main>
  );
}
