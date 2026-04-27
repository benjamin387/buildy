import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createLeadSiteVisitAction } from "@/app/(platform)/leads/[leadId]/site-visits/actions";

function toLocalDateTimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export default async function NewLeadSiteVisitPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  const { leadId } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      leadNumber: true,
      customerName: true,
      projectAddress: true,
      assignedSalesName: true,
      assignedSalesEmail: true,
    },
  });
  if (!lead) notFound();

  const defaultScheduled = new Date();
  defaultScheduled.setDate(defaultScheduled.getDate() + 1);

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/leads/${leadId}/site-visits`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {lead.leadNumber}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Schedule Site Visit
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            {lead.customerName}
          </h1>
          <p className="mt-2 text-sm text-neutral-600">{lead.projectAddress}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <form action={createLeadSiteVisitAction} className="grid gap-5 lg:grid-cols-2">
          <input type="hidden" name="leadId" value={leadId} />

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Scheduled at</span>
            <input
              type="datetime-local"
              name="scheduledAt"
              defaultValue={toLocalDateTimeValue(defaultScheduled)}
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Address snapshot</span>
            <input
              name="addressSnapshot"
              defaultValue={lead.projectAddress}
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. 123 Bedok Ave 3, #10-11"
            />
          </label>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Assignment
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Sales name</span>
                <input
                  name="assignedSalesName"
                  defaultValue={lead.assignedSalesName ?? ""}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Sales email</span>
                <input
                  name="assignedSalesEmail"
                  defaultValue={lead.assignedSalesEmail ?? ""}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                  placeholder="sales@company.com"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Designer name</span>
                <input
                  name="assignedDesignerName"
                  defaultValue=""
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Designer email</span>
                <input
                  name="assignedDesignerEmail"
                  defaultValue=""
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                  placeholder="designer@company.com"
                />
              </label>
            </div>
          </div>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Notes (optional)</span>
            <textarea
              name="notes"
              rows={3}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Access instructions, parking, client availability, etc."
            />
          </label>

          <div className="flex justify-end lg:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Create Site Visit
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
