import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AIChannel } from "@prisma/client";
import { requireExecutive } from "@/lib/rbac/executive";
import { generateAiPairingCodeAction, revokeAiChannelAction } from "@/app/(platform)/ai-access/actions";
import { safeQuery } from "@/lib/server/safe-query";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

function channelLabel(channel: string): string {
  if (channel === "TELEGRAM") return "Telegram";
  if (channel === "WHATSAPP") return "WhatsApp";
  return channel;
}

export default async function AIChannelsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireExecutive();
  const params = await searchParams;
  const showCode = firstString(params.pairingCode);
  const pairingCodeExpiresAt = firstString(params.pairingCodeExpiresAt);
  const channelFilter = firstString(params.channel);

  const channels = await safeQuery(() => prisma.aiUserChannel.findMany({
    where: { userId: user.id },
    orderBy: { channel: "asc" },
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
  }>);

  const supportedChannels = [AIChannel.TELEGRAM, AIChannel.WHATSAPP];
  const rowByChannel = new Map(channels.map((channel) => [channel.channel, channel]));

  const message = firstString(params.message);
  // eslint-disable-next-line react-hooks/purity -- server component renders once per request; Date.now() here is deterministic for the response
  const pairingExpiresAtDate = new Date(pairingCodeExpiresAt || Date.now() + 10 * 60 * 1000);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="AI Access"
        title="Channel Pairing"
        subtitle="Generate pairing codes, view connected device status, and revoke access for Telegram or WhatsApp."
        actions={
          <Link href="/ai-access">
            <ActionButton variant="secondary" size="sm">
              Back to Overview
            </ActionButton>
          </Link>
        }
      />

      {message ? (
        <section className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {message}
        </section>
      ) : null}

      {showCode && channelFilter ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          <p className="font-semibold">Pairing code generated for {channelFilter.toUpperCase()}</p>
          <p className="mt-1 text-lg font-mono text-neutral-900">{showCode}</p>
          <p className="mt-1 text-xs text-emerald-700">
            Expires at {formatDateTime(pairingExpiresAtDate)}
          </p>
          <p className="mt-2 text-xs text-neutral-700">Use one of these in your channel:</p>
          <ul className="mt-1 list-disc pl-5">
            <li>Telegram: send <code>/pair CODE</code></li>
            <li>WhatsApp: send <code>PAIR CODE</code></li>
          </ul>
        </section>
      ) : null}

      <section className="grid gap-6 md:grid-cols-2">
        {supportedChannels.map((channel) => {
          const existing = rowByChannel.get(channel) ?? null;
          return (
            <SectionCard
              key={channel}
              title={`${channelLabel(channel)} Pairing`}
              description="Generate a fresh pairing code and link this account."
              actions={
                <form action={generateAiPairingCodeAction}>
                  <input type="hidden" name="channel" value={channel} />
                  <ActionButton type="submit">Generate Pairing Code</ActionButton>
                </form>
              }
            >
              <div className="space-y-4">
                <p className="text-sm">
                  Status:{" "}
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                      existing?.isVerified
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {existing?.isVerified ? "Paired" : "Not paired"}
                  </span>
                </p>

                <div className="space-y-2 text-sm text-neutral-700">
                  <p>
                    <span className="font-semibold text-neutral-900">External identity:</span>{" "}
                    {existing?.displayName || existing?.username || existing?.phoneNumber || existing?.externalUserId || "Not linked yet"}
                  </p>
                  <p>
                    <span className="font-semibold text-neutral-900">Paired:</span> {formatDateTime(existing?.pairedAt ?? null)}
                  </p>
                  <p>
                    <span className="font-semibold text-neutral-900">Last seen:</span> {formatDateTime(existing?.lastSeenAt ?? null)}
                  </p>
                  <p>
                    <span className="font-semibold text-neutral-900">Updated:</span> {formatDateTime(existing?.updatedAt ?? null)}
                  </p>
                </div>

                {existing?.isVerified ? (
                  <form action={revokeAiChannelAction} className="pt-1">
                    <input type="hidden" name="channel" value={channel} />
                    <ActionButton type="submit" variant="danger">
                      Revoke Access
                    </ActionButton>
                  </form>
                ) : null}
              </div>
            </SectionCard>
          );
        })}
      </section>
    </main>
  );
}
