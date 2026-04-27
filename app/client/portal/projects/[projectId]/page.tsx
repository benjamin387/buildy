import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClientPortalProject, requireClientPortalAccount } from "@/lib/client-portal/auth";
import { submitClientPortalMessageAction } from "@/app/client/portal/actions";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function ClientPortalProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const access = await requireClientPortalProject({ projectId });
  const account = await requireClientPortalAccount();

  const invoices = await prisma.invoice.findMany({
    where: { projectId },
    orderBy: [{ issueDate: "desc" }],
    select: { id: true, invoiceNumber: true, status: true, totalAmount: true, outstandingAmount: true, dueDate: true },
    take: 20,
  });
  const outstanding = invoices.reduce((sum, i) => sum + Number(i.outstandingAmount), 0);

  const messages = await prisma.clientPortalMessage.findMany({
    where: { projectId, accountId: account.id },
    orderBy: [{ createdAt: "desc" }],
    take: 10,
  });

  return (
    <main className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-3">
        <Card title="Project Status" value={access.project.status} />
        <Card title="Outstanding Invoices" value={formatCurrency(outstanding)} />
        <Card title="Next Steps" value="Review quotation / invoices or contact the team." />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Quick Actions</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Use the buttons below to review project documents.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <QuickLink href={`/client/portal/projects/${projectId}/presentation`} label="View Presentation" />
            <QuickLink href={`/client/portal/projects/${projectId}/quotation`} label="Review Quotation" />
            <QuickLink href={`/client/portal/projects/${projectId}/contract`} label="View Contract" />
            <QuickLink href={`/client/portal/projects/${projectId}/invoices`} label="View Invoices" />
            <QuickLink href={`/client/portal/projects/${projectId}/progress`} label="View Progress" />
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Contact Project Team</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Send a message to your project team. Your message will be logged and responded to via official channels.
          </p>
          <form action={submitClientPortalMessageAction} className="mt-5 space-y-3">
            <input type="hidden" name="projectId" value={projectId} />
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Subject</span>
              <input
                name="subject"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Quotation question / Site schedule"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Message</span>
              <textarea
                name="message"
                rows={5}
                required
                className="rounded-xl border border-neutral-300 bg-white p-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Type your message..."
              />
            </label>
            <div className="flex justify-end">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Send Message
              </button>
            </div>
          </form>
        </section>
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Your Messages</h2>
            <p className="mt-2 text-sm text-neutral-600">Recent messages submitted via the portal.</p>
          </div>
          <Link href={`/client/portal/projects/${projectId}/invoices`} className="text-sm font-semibold text-neutral-900 hover:underline">
            View invoices →
          </Link>
        </div>

        {messages.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-700">No messages yet.</p>
        ) : (
          <div className="mt-5 divide-y divide-neutral-200 rounded-2xl border border-neutral-200">
            {messages.map((m) => (
              <div key={m.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">{m.subject}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{m.message}</p>
                    <p className="mt-2 text-xs text-neutral-500">
                      Status: {m.status} · Sent {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" }).format(m.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function QuickLink(props: { href: string; label: string }) {
  return (
    <Link
      href={props.href}
      className="inline-flex h-12 items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
    >
      {props.label}
    </Link>
  );
}

function Card(props: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-xl font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}

