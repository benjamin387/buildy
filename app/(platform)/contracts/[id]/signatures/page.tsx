import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value);
}

export default async function ContractSignaturesPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      contractSignatures: { orderBy: [{ createdAt: "desc" }] },
      contractApprovalLogs: { orderBy: [{ createdAt: "desc" }], take: 100 },
    },
  });

  if (!contract) notFound();
  await requirePermission({ permission: Permission.CONTRACT_READ, projectId: contract.projectId });

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Contracts / Signatures</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{contract.contractNumber}</h1>
            <p className="mt-2 text-sm text-slate-600">Project: {contract.project.name}</p>
          </div>
          <span className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
            {contract.status}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/api/contracts/${contract.id}/signed-pdf`}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Download Signed Contract PDF
          </Link>
          <Link
            href={`/projects/${contract.projectId}/contract/${contract.id}`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Open Contract Detail
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Signature Status</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-800">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">Signer</th>
                <th className="px-3 py-3 text-left font-semibold">Email</th>
                <th className="px-3 py-3 text-left font-semibold">Phone</th>
                <th className="px-3 py-3 text-left font-semibold">Signed At</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {contract.contractSignatures.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-slate-600">No signatures recorded yet.</td>
                </tr>
              ) : contract.contractSignatures.map((item) => (
                <tr key={item.id} className="border-t border-slate-200">
                  <td className="px-3 py-3 text-slate-900">{item.signerName}</td>
                  <td className="px-3 py-3 text-slate-700">{item.signerEmail}</td>
                  <td className="px-3 py-3 text-slate-700">{item.signerPhone || "-"}</td>
                  <td className="px-3 py-3 text-slate-700">{formatDate(item.signedAt)}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Approval Audit Trail</h2>
        <div className="mt-4 space-y-3">
          {contract.contractApprovalLogs.length === 0 ? (
            <p className="text-sm text-slate-600">No audit events recorded yet.</p>
          ) : contract.contractApprovalLogs.map((log) => (
            <article key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{log.action}</p>
                <p className="text-xs text-slate-500">{formatDate(log.createdAt)}</p>
              </div>
              {log.comment ? <p className="mt-2 text-sm text-slate-700">{log.comment}</p> : null}
              <p className="mt-2 text-xs text-slate-500">IP: {log.ipAddress || "-"} · UA: {log.userAgent || "-"}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
