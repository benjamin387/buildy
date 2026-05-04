import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";

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

function envPresent(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim());
}

function badge(ok: boolean): string {
  return ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
}

function buildAbsoluteUrl(path: string, host: string): string {
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}${path}`;
}

export default async function BotLeadsSettingsPage() {
  await requirePermission({ permission: Permission.SETTINGS_READ });

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "app.buildy.sg";

  const whatsappWebhook = buildAbsoluteUrl("/api/webhooks/whatsapp/leads", host);
  const telegramWebhook = buildAbsoluteUrl("/api/webhooks/telegram/leads", host);

  const sessions = await prisma.leadBotSession.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 20,
    include: {
      submittedByUser: { select: { id: true, email: true, name: true } },
    },
  });

  const checks = [
    { key: "WHATSAPP_PHONE_NUMBER_ID", ok: envPresent("WHATSAPP_PHONE_NUMBER_ID") },
    { key: "WHATSAPP_ACCESS_TOKEN", ok: envPresent("WHATSAPP_ACCESS_TOKEN") },
    { key: "WHATSAPP_VERIFY_TOKEN", ok: envPresent("WHATSAPP_VERIFY_TOKEN") },
    { key: "WHATSAPP_APP_SECRET", ok: envPresent("WHATSAPP_APP_SECRET") },
    { key: "TELEGRAM_BOT_TOKEN", ok: envPresent("TELEGRAM_BOT_TOKEN") },
    { key: "TELEGRAM_WEBHOOK_SECRET", ok: envPresent("TELEGRAM_WEBHOOK_SECRET") },
  ];

  return (
    <main className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Settings / Bot Lead Intake
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
          WhatsApp + Telegram Lead Intake
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Webhook endpoints for capturing customer leads via chat. Users must register their WhatsApp number or Telegram chat id in{" "}
          <span className="font-medium text-neutral-900">Settings → Lead Channels</span> first.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Webhook URLs</p>
          <div className="mt-4 grid gap-3 text-sm">
            <div>
              <p className="font-semibold text-neutral-900">WhatsApp</p>
              <p className="mt-1 break-all rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-800">
                {whatsappWebhook}
              </p>
            </div>
            <div>
              <p className="font-semibold text-neutral-900">Telegram</p>
              <p className="mt-1 break-all rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-800">
                {telegramWebhook}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Env Checklist</p>
          <div className="mt-4 grid gap-2">
            {checks.map((c) => (
              <div key={c.key} className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3">
                <span className="font-mono text-xs text-neutral-800">{c.key}</span>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${badge(c.ok)}`}>
                  {c.ok ? "SET" : "MISSING"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Secrets are never exposed to the client. Configure these in Vercel Environment Variables.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-neutral-950">Latest Bot Sessions</h2>
          <p className="mt-1 text-sm text-neutral-600">Most recent 20 bot intake sessions across WhatsApp and Telegram.</p>
        </div>
        <div className="overflow-hidden rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-4 py-4 text-left font-semibold">Channel</th>
                <th className="px-4 py-4 text-left font-semibold">External User</th>
                <th className="px-4 py-4 text-left font-semibold">Status</th>
                <th className="px-4 py-4 text-left font-semibold">Step</th>
                <th className="px-4 py-4 text-left font-semibold">Submitted By</th>
                <th className="px-4 py-4 text-left font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-neutral-600" colSpan={6}>
                    No bot sessions yet.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 font-medium text-neutral-900">{s.channel}</td>
                    <td className="px-4 py-4 text-neutral-700">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">{s.externalUserId}</span>
                        <span className="text-xs text-neutral-500">{s.phoneNumber ?? s.telegramChatId ?? "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{s.currentStep}</td>
                    <td className="px-4 py-4 text-neutral-700">
                      {s.submittedByUser ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-neutral-900">{s.submittedByUser.name ?? s.submittedByUser.email}</span>
                          <span className="text-xs text-neutral-500">{s.submittedByUser.email}</span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{formatDateTime(s.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

