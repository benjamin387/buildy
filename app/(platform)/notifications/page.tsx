import Link from "next/link";
import { NotificationSeverity } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { getUserNotifications } from "@/lib/notifications/service";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { PaginationControls } from "@/app/components/ui/pagination";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/(platform)/notifications/actions";

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function tone(severity: NotificationSeverity) {
  if (severity === "SUCCESS") return "success" as const;
  if (severity === "WARNING") return "warning" as const;
  if (severity === "CRITICAL") return "danger" as const;
  return "neutral" as const;
}

export default async function NotificationsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const searchParams = (await props.searchParams) ?? {};

  const pageParam = Number(String(searchParams.page ?? "1"));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const pageSize = 50;
  const skip = (page - 1) * pageSize;

  const unreadOnly = String(searchParams.unread ?? "") === "1";
  const severityParam = String(searchParams.severity ?? "").toUpperCase();
  const severity =
    severityParam === "INFO" || severityParam === "SUCCESS" || severityParam === "WARNING" || severityParam === "CRITICAL"
      ? (severityParam as NotificationSeverity)
      : null;

  const { total, items } = await (async () => {
    try {
      return await getUserNotifications({
        user,
        unreadOnly,
        severity,
        take: pageSize,
        skip,
      });
    } catch (err) {
      console.error("[notifications] failed to load:", err);
      return { total: 0, items: [] };
    }
  })();

  const hasAny = total > 0;
  const baseParams = new URLSearchParams();
  if (unreadOnly) baseParams.set("unread", "1");
  if (severity) baseParams.set("severity", severity);

  function pageHref(nextPage: number) {
    const params = new URLSearchParams(baseParams);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/notifications?${qs}` : "/notifications";
  }

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Inbox"
        title="Notifications"
        subtitle="Alerts, reminders, and system events relevant to you."
        actions={<form action={markAllNotificationsReadAction}><ActionButton type="submit" variant="secondary">Mark all as read</ActionButton></form>}
      />

      <SectionCard
        title="Filters"
        description="Narrow your inbox to what needs attention."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/notifications">
              <ActionButton variant={unreadOnly || severity ? "secondary" : "primary"}>All</ActionButton>
            </Link>
            <Link href="/notifications?unread=1">
              <ActionButton variant={unreadOnly ? "primary" : "secondary"}>Unread</ActionButton>
            </Link>
            <Link href="/notifications?severity=CRITICAL">
              <ActionButton variant={severity === "CRITICAL" ? "primary" : "secondary"}>Critical</ActionButton>
            </Link>
            <Link href="/notifications?severity=WARNING">
              <ActionButton variant={severity === "WARNING" ? "primary" : "secondary"}>Warning</ActionButton>
            </Link>
          </div>
        }
      >
        <p className="text-sm text-neutral-600">Showing {items.length} of {total} notifications.</p>
      </SectionCard>

      <SectionCard title="Inbox" description="Click through for full context.">
        {hasAny ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Title</th>
                  <th className="px-3 py-3">Message</th>
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((n) => (
                  <tr key={n.id} className={n.isRead ? "" : "bg-stone-50/60"}>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-2">
                        <StatusPill tone={tone(n.severity)}>{n.severity}</StatusPill>
                        {!n.isRead ? <StatusPill tone="info">UNREAD</StatusPill> : null}
                      </div>
                    </td>
                    <td className="px-3 py-4 font-semibold text-neutral-950">{n.title}</td>
                    <td className="px-3 py-4 text-neutral-600">
                      <div className="max-w-[520px] overflow-hidden text-ellipsis">{n.message}</div>
                    </td>
                    <td className="px-3 py-4 text-neutral-500">{formatDateTime(n.createdAt)}</td>
                    <td className="px-3 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {n.actionUrl ? (
                          <Link href={n.actionUrl}>
                            <ActionButton variant="secondary">Open</ActionButton>
                          </Link>
                        ) : null}
                        {!n.isRead ? (
                          <form action={markNotificationReadAction}>
                            <input type="hidden" name="id" value={n.id} />
                            <ActionButton type="submit" variant="secondary">
                              Mark read
                            </ActionButton>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>

            <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={pageHref} />
          </div>
        ) : (
          <EmptyState
            title="No notifications yet"
            description="System alerts and reminders will appear here when events occur."
            ctaHref="/dashboard"
            ctaLabel="Back to Dashboard"
          />
        )}
      </SectionCard>
    </main>
  );
}
