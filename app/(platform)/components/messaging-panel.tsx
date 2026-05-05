import { MessageChannel, type MessageRelatedType, type PublicDocumentType } from "@prisma/client";
import { listOutboundMessagesForEntity } from "@/lib/messaging/service";
import { sendOutboundMessageAction, sendOutboundMessageDraftAction } from "@/app/(platform)/messaging/actions";

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

export async function MessagingPanel(props: {
  returnTo: string;
  projectId?: string | null;
  relatedType: MessageRelatedType;
  relatedId: string;
  documentType: PublicDocumentType;
  documentId: string;
  defaultRecipientName?: string | null;
  defaultRecipientEmail?: string | null;
  defaultRecipientPhone?: string | null;
  defaultSubject?: string | null;
  defaultBody?: string | null;
  defaultChannel?: MessageChannel;
  collectionActionId?: string | null;
}) {
  const history = await listOutboundMessagesForEntity({
    relatedType: props.relatedType,
    relatedId: props.relatedId,
    take: 20,
  });

  const defaultChannel = props.defaultChannel ?? "EMAIL";
  const defaultRecipientAddress =
    defaultChannel === "WHATSAPP" ? props.defaultRecipientPhone : props.defaultRecipientEmail;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-neutral-950">Send &amp; Delivery</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Send by email or WhatsApp as a secure link (PDF attachment snapshot wiring comes later). Messages are logged to project communications.
        </p>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <form action={sendOutboundMessageAction} className="space-y-4">
          <input type="hidden" name="returnTo" value={props.returnTo} />
          <input type="hidden" name="projectId" value={props.projectId ?? ""} />
          <input type="hidden" name="relatedType" value={props.relatedType} />
          <input type="hidden" name="relatedId" value={props.relatedId} />
          <input type="hidden" name="documentType" value={props.documentType} />
          <input type="hidden" name="documentId" value={props.documentId} />
          <input type="hidden" name="collectionActionId" value={props.collectionActionId ?? ""} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Channel</span>
              <select
                name="channel"
                defaultValue={defaultChannel}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              >
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="LINK">Secure Link Only</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Recipient Name</span>
              <input
                name="recipientName"
                required
                defaultValue={props.defaultRecipientName ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Client / Supplier"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">
                Recipient Address (email/phone, optional for Link-only)
              </span>
              <input
                name="recipientAddress"
                defaultValue={defaultRecipientAddress ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. name@email.com / +65..."
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Subject (Email only)</span>
              <input
                name="subject"
                defaultValue={props.defaultSubject ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="Subject"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Message</span>
              <textarea
                name="body"
                rows={6}
                required
                defaultValue={props.defaultBody ?? ""}
                className="rounded-xl border border-neutral-300 bg-white p-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Message body"
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span className="text-neutral-800">Include secure link</span>
              <input name="includeSecureLink" type="checkbox" defaultChecked className="h-4 w-4" />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-neutral-800">Attach PDF snapshot</span>
              <input name="includePdfAttachment" type="checkbox" className="h-4 w-4" />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-neutral-800">Link expiry (days)</span>
              <input
                name="linkExpiresInDays"
                type="number"
                min={1}
                step={1}
                className="h-10 w-28 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. 14"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Send
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Send History
            </h3>
          </div>
          {history.length === 0 ? (
            <div className="px-4 py-4 text-sm text-neutral-600">No outbound messages yet.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {history.map((m) => (
                <div key={m.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-700">
                          {m.channel}
                        </span>
                        <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-700">
                          {m.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-neutral-950">{m.recipientName}</p>
                      <p className="text-xs text-neutral-500">{m.recipientAddress}</p>
                      <p className="mt-2 text-xs text-neutral-500">
                        Created {formatDateTime(m.createdAt)} · Sent {formatDateTime(m.sentAt)} · Failed{" "}
                        {formatDateTime(m.failedAt)}
                      </p>
                      {m.publicDocumentLink ? (
                        <p className="mt-2 text-xs text-neutral-500">
                          Link view:{" "}
                          <span className="font-medium text-neutral-800">
                            {m.publicDocumentLink.viewedAt ? formatDateTime(m.publicDocumentLink.viewedAt) : "Not viewed"}
                          </span>{" "}
                          · Expires {formatDateTime(m.publicDocumentLink.expiresAt)}
                        </p>
                      ) : null}
                      {m.errorMessage ? (
                        <p className="mt-2 text-xs text-red-700">{m.errorMessage}</p>
                      ) : null}
                      {m.attachments.length > 0 ? (
                        <p className="mt-2 text-xs text-neutral-600">
                          Attachments: {m.attachments.map((a) => a.fileName).join(", ")}
                        </p>
                      ) : null}
                    </div>
                    {m.channel !== "LINK" && (m.status === "DRAFT" || m.status === "FAILED") ? (
                      <form action={sendOutboundMessageDraftAction} className="shrink-0">
                        <input type="hidden" name="returnTo" value={props.returnTo} />
                        <input type="hidden" name="messageId" value={m.id} />
                        <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Send draft
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
