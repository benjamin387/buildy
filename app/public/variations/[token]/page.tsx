import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActivePublicLinkByToken, markPublicLinkViewed } from "@/lib/messaging/public-links";
import { approveVariationPublicAction, rejectVariationPublicAction } from "@/app/public/variations/[token]/actions";

export const dynamic = "force-dynamic";

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

export default async function PublicVariationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const result = typeof sp.result === "string" ? sp.result : null;

  const link = await getActivePublicLinkByToken(token);
  if (!link || link.documentType !== "VARIATION_ORDER") notFound();

  await markPublicLinkViewed(link.id);

  const vo = await prisma.variationOrder.findUnique({
    where: { id: link.documentId },
    include: { project: true, lineItems: { orderBy: { sortOrder: "asc" } }, approvals: true },
  });
  if (!vo) notFound();

  const revenue = Number(vo.subtotal);

  const alreadyDecided = ["APPROVED", "INVOICED", "REJECTED", "CANCELLED"].includes(vo.status);
  const defaultApprover = vo.project.clientName || "Client";
  const defaultEmail = vo.project.clientEmail || "";

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-10 text-neutral-900 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Variation Order Approval
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            {vo.referenceNumber}
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Project: <span className="font-medium text-neutral-900">{vo.project.name}</span>
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            This link is token-protected. If you are not an intended recipient, please close this page.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Home
            </Link>
          </div>
        </header>

        {result ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-neutral-900">
              {result === "approved" ? "Thank you. Your approval has been recorded." : "Your rejection has been recorded."}
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Status: <span className="font-semibold text-neutral-900">{vo.status}</span>
            </p>
          </section>
        ) : null}

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Work Description</p>
              <p className="mt-2 text-lg font-semibold text-neutral-950">{vo.title}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{vo.description ?? "-"}</p>
              <p className="mt-4 text-sm text-neutral-600">
                Submitted: <span className="font-medium text-neutral-900">{formatDate(vo.submittedAt)}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Financial Summary</p>
              <p className="mt-2 text-sm text-neutral-700">Subtotal (net): <span className="font-semibold text-neutral-950">{formatCurrency(revenue)}</span></p>
              <p className="mt-1 text-sm text-neutral-700">GST: <span className="font-semibold text-neutral-950">{formatCurrency(Number(vo.gstAmount))}</span></p>
              <p className="mt-2 text-sm text-neutral-700">Total (gross): <span className="font-semibold text-neutral-950">{formatCurrency(Number(vo.totalAmount))}</span></p>
              <p className="mt-3 text-xs text-neutral-500">
                This variation updates the project scope and contract sum. Detailed internal costing is not shown here.
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Items</h2>
          </div>
          <div className="overflow-x-auto p-6">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Description</th>
                  <th className="px-3 py-3 text-right font-semibold">Qty</th>
                  <th className="px-3 py-3 text-left font-semibold">Unit</th>
                  <th className="px-3 py-3 text-right font-semibold">Unit Rate</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {vo.lineItems.map((l) => (
                  <tr key={l.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3 text-neutral-900">{l.description}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">{Number(l.quantity).toFixed(2)}</td>
                    <td className="px-3 py-3 text-neutral-700">{l.unit}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">{formatCurrency(Number(l.unitPrice))}</td>
                    <td className="px-3 py-3 text-right font-medium text-neutral-900">{formatCurrency(Number(l.totalPrice))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Decision</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Approve this Variation Order to confirm the scope and cost change. If you reject, please provide remarks.
          </p>

          {alreadyDecided ? (
            <p className="mt-4 text-sm text-neutral-700">
              Current status: <span className="font-semibold text-neutral-900">{vo.status}</span>
            </p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <form action={approveVariationPublicAction} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <input type="hidden" name="token" value={token} />
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Your Name</span>
                  <input
                    name="approverName"
                    required
                    defaultValue={defaultApprover}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-emerald-300 focus:ring-2"
                  />
                </label>
                <label className="mt-3 grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Your Email</span>
                  <input
                    name="approverEmail"
                    required
                    defaultValue={defaultEmail}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-emerald-300 focus:ring-2"
                  />
                </label>
                <label className="mt-3 grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Remarks (optional)</span>
                  <textarea
                    name="remarks"
                    rows={3}
                    className="rounded-xl border border-neutral-300 bg-white p-3 text-sm outline-none ring-emerald-300 focus:ring-2"
                    placeholder="Optional remarks"
                  />
                </label>
                <button className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800">
                  Approve Variation
                </button>
              </form>

              <form action={rejectVariationPublicAction} className="rounded-2xl border border-red-200 bg-red-50 p-5">
                <input type="hidden" name="token" value={token} />
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Your Name</span>
                  <input
                    name="approverName"
                    required
                    defaultValue={defaultApprover}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-red-300 focus:ring-2"
                  />
                </label>
                <label className="mt-3 grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Your Email</span>
                  <input
                    name="approverEmail"
                    required
                    defaultValue={defaultEmail}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-red-300 focus:ring-2"
                  />
                </label>
                <label className="mt-3 grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Rejection Remarks</span>
                  <textarea
                    name="remarks"
                    required
                    rows={3}
                    className="rounded-xl border border-neutral-300 bg-white p-3 text-sm outline-none ring-red-300 focus:ring-2"
                    placeholder="Please tell us why you are rejecting this variation."
                  />
                </label>
                <button className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-red-700 px-5 text-sm font-semibold text-white transition hover:bg-red-800">
                  Reject Variation
                </button>
              </form>
            </div>
          )}
        </section>

        <footer className="text-center text-xs text-neutral-500">
          Viewed {formatDate(new Date())} · Expires {formatDate(link.expiresAt)}
        </footer>
      </div>
    </main>
  );
}
