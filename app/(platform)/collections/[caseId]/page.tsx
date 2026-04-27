import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getCollectionCaseById } from "@/lib/collections/service";
import {
  addManualCollectionNoteAction,
  closeCollectionCaseAction,
  completeCollectionActionAction,
  markPromiseToPayAction,
  refreshCollectionsAction,
} from "@/app/(platform)/collections/actions";
import { MessagingPanel } from "@/app/(platform)/components/messaging-panel";
import { ActivityTimeline } from "@/app/components/timeline/activity-timeline";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function CollectionCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  await requirePermission({ permission: Permission.INVOICE_READ });

  const c = await getCollectionCaseById(caseId);
  if (!c) notFound();

  const invoiceHref = `/projects/${c.projectId}/invoices/${c.invoiceId}`;
  const projectCollectionsHref = `/projects/${c.projectId}/collections`;

  const actionsAsc = [...c.actions].sort((a, b) => {
    const at = a.scheduledAt.getTime();
    const bt = b.scheduledAt.getTime();
    if (at !== bt) return at - bt;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const pendingActions = actionsAsc.filter((a) => a.status === "PENDING");
  const isClosed = ["PAID", "CLOSED"].includes(c.status);
  const nextPending = pendingActions[0] ?? null;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/collections"
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <SeverityBadge severity={c.severity} />
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {c.status}
            </span>
          </div>

          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Collection Case
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {c.caseNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Debtor: {c.debtorName} · Outstanding:{" "}
            <span className="font-semibold text-neutral-950 tabular-nums">
              {formatCurrency(Number(c.outstandingAmount))}
            </span>{" "}
            · DPD: <span className="font-semibold tabular-nums">{c.daysPastDue}</span> · Next action:{" "}
            {formatDate(c.nextActionDate)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={refreshCollectionsAction}>
            <input type="hidden" name="projectId" value={c.projectId} />
            <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              Refresh
            </button>
          </form>
          <Link
            href={projectCollectionsHref}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Project Cases
          </Link>
          <Link
            href={invoiceHref}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            View Invoice
          </Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card title="Debtor">
          <InfoRow label="Name" value={c.debtorName} />
          <InfoRow label="Email" value={c.debtorEmail ?? "-"} />
          <InfoRow label="Phone" value={c.debtorPhone ?? "-"} />
        </Card>
        <Card title="Invoice">
          <InfoRow label="Invoice no" value={c.invoice.invoiceNumber} />
          <InfoRow label="Invoice status" value={c.invoice.status} />
          <InfoRow label="Due date" value={formatDate(c.dueDate)} />
          <InfoRow label="Total" value={formatCurrency(Number(c.invoice.totalAmount))} />
          <InfoRow label="Outstanding" value={formatCurrency(Number(c.invoice.outstandingAmount))} />
        </Card>
        <Card title="Case Control">
          <InfoRow label="Status" value={c.status} />
          <InfoRow label="Severity" value={c.severity} />
          <InfoRow label="Next action" value={formatDate(c.nextActionDate)} />
          <InfoRow label="Created" value={formatDate(c.createdAt)} />
        </Card>
      </section>

      <MessagingPanel
        returnTo={`/collections/${c.id}`}
        projectId={c.projectId}
        relatedType="COLLECTION_REMINDER"
        relatedId={c.id}
        documentType="COLLECTION_REMINDER"
        documentId={c.id}
        defaultRecipientName={c.debtorName}
        defaultRecipientEmail={c.debtorEmail}
        defaultRecipientPhone={c.debtorPhone}
        defaultSubject={`Payment reminder: ${c.invoice.invoiceNumber}`}
        defaultBody={
          nextPending?.message
            ? nextPending.message
            : `Hi ${c.debtorName}, friendly reminder that invoice ${c.invoice.invoiceNumber} is overdue. Outstanding: ${formatCurrency(
                Number(c.outstandingAmount),
              )}. Please arrange payment today or let us know your payment date. Thank you.`
        }
        defaultChannel={nextPending?.channel === "WHATSAPP" ? "WHATSAPP" : "EMAIL"}
        collectionActionId={nextPending?.id ?? null}
      />

      <ActivityTimeline
        entityType="CollectionCase"
        entityId={c.id}
        take={25}
        title="Collections Audit"
        description="Automated reminders, manual notes, status changes and escalation markers."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Action Timeline</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Track reminders and escalation steps. Sending integrations come later; mark actions completed as you execute them.
            </p>
          </div>
          {actionsAsc.length === 0 ? (
            <div className="px-6 py-6 text-sm text-neutral-600">No actions recorded yet.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {actionsAsc
                .slice()
                .reverse()
                .map((a) => (
                  <div key={a.id} className="px-6 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-700">
                            {a.actionType}
                          </span>
                          <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-700">
                            {a.channel}
                          </span>
                          <span className="text-xs text-neutral-500">{a.status}</span>
                        </div>
                        <p className="mt-2 text-sm text-neutral-900">
                          Scheduled: {formatDate(a.scheduledAt)}{" "}
                          {a.completedAt ? (
                            <span className="text-neutral-500">· Completed: {formatDate(a.completedAt)}</span>
                          ) : null}
                        </p>
                        {a.message ? (
                          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-800">
                            {a.message}
                          </pre>
                        ) : null}
                      </div>

                      {a.status === "PENDING" && !isClosed ? (
                        <form action={completeCollectionActionAction}>
                          <input type="hidden" name="caseId" value={c.id} />
                          <input type="hidden" name="actionId" value={a.id} />
                          <button className="inline-flex h-9 items-center justify-center rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800">
                            Mark Completed
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <Card title="Add Manual Note">
            <form action={addManualCollectionNoteAction} className="space-y-3">
              <input type="hidden" name="caseId" value={c.id} />
              <textarea
                name="message"
                rows={4}
                required
                className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Add a manual note (e.g. called debtor, agreed payment date, dispute notes)."
              />
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Add Note
              </button>
            </form>
          </Card>

          <Card title="Promise To Pay">
            <form action={markPromiseToPayAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="caseId" value={c.id} />
              <div className="sm:col-span-1">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Next action date
                </label>
                <input
                  name="nextActionDate"
                  type="date"
                  defaultValue={c.nextActionDate ? c.nextActionDate.toISOString().slice(0, 10) : todayIsoDate()}
                  className="mt-2 h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Notes
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                  defaultValue={c.notes ?? ""}
                  placeholder="Record promise-to-pay notes (optional)."
                />
              </div>
              <div className="sm:col-span-2">
                <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                  Mark Promise To Pay
                </button>
              </div>
            </form>
          </Card>

          <Card title="Close Case">
            <form action={closeCollectionCaseAction} className="space-y-3">
              <input type="hidden" name="caseId" value={c.id} />
              <textarea
                name="notes"
                rows={3}
                className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Closure notes (optional)."
              />
              <button
                disabled={isClosed}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Close Case
              </button>
            </form>
            {pendingActions.length > 0 ? (
              <p className="mt-3 text-xs text-neutral-500">
                This case has pending actions. Closing it will not delete action history.
              </p>
            ) : null}
          </Card>
        </section>
      </section>
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
      <span className="font-medium text-neutral-950 tabular-nums">{props.value}</span>
    </div>
  );
}

function SeverityBadge(props: { severity: string }) {
  const tone =
    props.severity === "CRITICAL"
      ? "bg-red-50 text-red-700 border-red-200"
      : props.severity === "HIGH"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : props.severity === "MEDIUM"
          ? "bg-yellow-50 text-yellow-800 border-yellow-200"
          : "bg-neutral-100 text-neutral-700 border-neutral-200";
  return (
    <span
      className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone}`}
    >
      {props.severity}
    </span>
  );
}
