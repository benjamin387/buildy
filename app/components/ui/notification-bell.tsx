"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ExternalLink, X } from "lucide-react";
import { StatusPill } from "@/app/components/ui/status-pill";

type NotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

type PreviewItem = {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
};

type PreviewResponse =
  | { ok: true; unreadCount: number; items: PreviewItem[] }
  | { ok: false; error: string };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function tone(severity: NotificationSeverity) {
  if (severity === "SUCCESS") return "success" as const;
  if (severity === "WARNING") return "warning" as const;
  if (severity === "CRITICAL") return "danger" as const;
  return "neutral" as const;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (!Number.isFinite(diffSec)) return "";
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d`;
}

type Toast = {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const pollTimerRef = useRef<number | null>(null);

  const badgeText = useMemo(() => {
    if (unreadCount <= 0) return null;
    if (unreadCount > 99) return "99+";
    return String(unreadCount);
  }, [unreadCount]);

  async function loadPreview(opts?: { showToasts?: boolean }) {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/preview", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as PreviewResponse | null;
      if (!data || data.ok !== true) {
        setLoading(false);
        return;
      }

      setUnreadCount(Number.isFinite(data.unreadCount) ? data.unreadCount : 0);
      setItems(Array.isArray(data.items) ? data.items : []);

      if (opts?.showToasts) {
        const unseen = (data.items ?? []).filter((n) => !seenRef.current.has(n.id));
        // Only toast unread items to avoid noise.
        const unseenUnread = unseen.filter((n) => !n.isRead);
        if (unseenUnread.length) {
          const latest = unseenUnread[0];
          const toast: Toast = { id: latest.id, title: latest.title, message: latest.message, severity: latest.severity };
          setToasts((prev) => [toast, ...prev].slice(0, 3));
          window.setTimeout(() => {
            setToasts((prev) => prev.filter((x) => x.id !== toast.id));
          }, 8000);
        }
        for (const n of data.items ?? []) {
          seenRef.current.add(n.id);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    await fetch("/api/notifications/mark-all-read", { method: "POST" }).catch(() => null);
    await loadPreview();
  }

  async function markRead(id: string) {
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    await loadPreview();
  }

  useEffect(() => {
    loadPreview({ showToasts: false }).catch(() => null);
    pollTimerRef.current = window.setInterval(() => {
      loadPreview({ showToasts: true }).catch(() => null);
    }, 20000);

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) loadPreview().catch(() => null);
        }}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-neutral-700 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {badgeText ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white shadow">
            {badgeText}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-neutral-950">Notifications</p>
                <p className="mt-0.5 text-xs text-neutral-600">
                  {unreadCount} unread{loading ? " · Updating…" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => markAllRead().catch(() => null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                >
                  <Check className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-auto">
              {items.length ? (
                <ul className="divide-y divide-slate-200">
                  {items.map((n) => (
                    <li key={n.id} className={cx("px-4 py-3", !n.isRead && "bg-stone-50/60")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill tone={tone(n.severity)}>{n.severity}</StatusPill>
                            <p className="truncate text-sm font-semibold text-neutral-950">{n.title}</p>
                          </div>
                          <p className="mt-1 max-h-10 overflow-hidden text-ellipsis text-xs leading-5 text-neutral-600">
                            {n.message}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                            <span>{formatRelative(n.createdAt)}</span>
                            {n.actionUrl ? (
                              <Link
                                href={n.actionUrl}
                                onClick={() => {
                                  markRead(n.id).catch(() => null);
                                  setOpen(false);
                                }}
                                className="inline-flex items-center gap-1 font-semibold text-neutral-900 transition hover:opacity-80"
                              >
                                Open
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            ) : null}
                            {!n.isRead ? (
                              <button
                                type="button"
                                onClick={() => markRead(n.id).catch(() => null)}
                                className="font-semibold text-neutral-900 transition hover:opacity-80"
                              >
                                Mark read
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-neutral-950">All caught up.</p>
                  <p className="mt-1 text-xs text-neutral-600">New alerts and reminders will appear here.</p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-2">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2 text-center text-sm font-semibold text-neutral-950 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                View all notifications
              </Link>
            </div>
          </div>
        </>
      ) : null}

      {toasts.length ? (
        <div className="pointer-events-none fixed right-4 top-[72px] z-50 flex w-[340px] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cx(
                "pointer-events-auto overflow-hidden rounded-2xl border bg-white shadow-xl",
                t.severity === "CRITICAL"
                  ? "border-red-200"
                  : t.severity === "WARNING"
                    ? "border-amber-200"
                    : t.severity === "SUCCESS"
                      ? "border-emerald-200"
                      : "border-slate-200",
              )}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={tone(t.severity)}>{t.severity}</StatusPill>
                    <p className="truncate text-sm font-semibold text-neutral-950">{t.title}</p>
                  </div>
                  <p className="mt-1 max-h-10 overflow-hidden text-ellipsis text-xs leading-5 text-neutral-600">
                    {t.message}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-neutral-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                  aria-label="Dismiss notification"
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
