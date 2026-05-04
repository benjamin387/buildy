import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClientPortalProject } from "@/lib/client-portal/auth";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

export default async function ClientPortalContractPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireClientPortalProject({ projectId });

  const contract = await prisma.contract.findFirst({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      milestones: { orderBy: { sortOrder: "asc" } },
      clauses: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!contract) notFound();

  const signatureRequests = await prisma.signatureRequest.findMany({
    where: { contractId: contract.id, documentType: "CONTRACT", documentId: contract.id },
    include: { parties: { orderBy: { sequenceNo: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Contract</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">{contract.contractNumber}</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Status: <span className="font-semibold text-neutral-900">{contract.status}</span> · Date {formatDate(contract.contractDate)}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Contract Value</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-950">{formatCurrency(Number(contract.contractValue))}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">Signing Status</h3>
        {signatureRequests.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-700">No signature requests have been sent yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {signatureRequests.map((req) => (
              <div key={req.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-950">
                  Request {req.id.slice(0, 8)} · {req.status}
                </p>
                <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-100 text-neutral-800">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold">Signer</th>
                        <th className="px-3 py-3 text-left font-semibold">Email</th>
                        <th className="px-3 py-3 text-left font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {req.parties.map((p) => (
                        <tr key={p.id} className="border-t border-neutral-200">
                          <td className="px-3 py-3 text-neutral-900">{p.name}</td>
                          <td className="px-3 py-3 text-neutral-700">{p.email}</td>
                          <td className="px-3 py-3 text-neutral-900">{p.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-neutral-500">
          If you have questions about the contract or signing sequence, please contact your project team via the portal.
        </p>
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">Key Milestones</h3>
        {contract.milestones.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-700">No milestones defined.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Milestone</th>
                  <th className="px-4 py-3 text-left font-semibold">Due</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {contract.milestones.map((m) => (
                  <tr key={m.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 text-neutral-900">{m.title}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(m.dueDate)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">
                      {formatCurrency(Number(m.amount))}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-neutral-950">Contract Document</h3>
            <p className="mt-2 text-sm text-neutral-600">You can print or save this page as a PDF for your records.</p>
          </div>
          <Link
            href={`/public/documents`}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => {}}
            className="hidden"
          />
        </div>
        <div className="mt-4 grid gap-2 text-sm text-neutral-700">
          <p>Start date: {formatDate(contract.startDate)}</p>
          <p>Completion date: {formatDate(contract.completionDate)}</p>
        </div>
        <div className="mt-6 space-y-4">
          {contract.clauses.slice(0, 10).map((c) => (
            <div key={c.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-950">{c.title}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{c.content}</p>
            </div>
          ))}
          {contract.clauses.length > 10 ? (
            <p className="text-xs text-neutral-500">
              Showing a summary. Full contract clauses are available in the signed/printed contract shared by your project team.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

