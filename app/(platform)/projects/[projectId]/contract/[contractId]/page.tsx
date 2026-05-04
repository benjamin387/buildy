import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { getProjectPermissions, requirePermission, requireUserId } from "@/lib/rbac";
import { sendContractForSignature, updateContractClause } from "@/app/(platform)/projects/[projectId]/contract/actions";
import { MessagingPanel } from "@/app/(platform)/components/messaging-panel";
import { ClientDeliveryActions } from "@/app/(platform)/components/client-delivery-actions";
import { ActivityTimeline } from "@/app/components/timeline/activity-timeline";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; contractId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, contractId } = await params;
  await requirePermission({ permission: Permission.CONTRACT_READ, projectId });

  const userId = await requireUserId();
  const permissions = await getProjectPermissions({ userId, projectId });
  const canApprove = permissions.has(Permission.CONTRACT_APPROVE);
  const canWrite = permissions.has(Permission.CONTRACT_WRITE);

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      quotation: true,
      milestones: { orderBy: { sortOrder: "asc" } },
      clauses: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!contract || contract.projectId !== projectId) notFound();

  const signatureRequests = await prisma.signatureRequest.findMany({
    where: { contractId: contract.id, documentType: "CONTRACT", documentId: contract.id },
    include: { parties: { orderBy: { sequenceNo: "asc" } }, events: { orderBy: { eventAt: "desc" }, take: 3 } },
    orderBy: { createdAt: "desc" },
  });

  const sp = await searchParams;
  const deliveryToken = typeof sp.deliveryToken === "string" ? sp.deliveryToken : null;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/contract`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-800">
              {contract.status}
            </span>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Job Contract
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {contract.contractNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Date: {formatDate(contract.contractDate)} · Source quotation:{" "}
            {contract.quotation?.quotationNumber ?? "-"}
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">
            Contract Value
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {formatCurrency(Number(contract.totalAmount))}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={`/projects/${projectId}/contract/${contractId}/print`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Print / Save as PDF
        </Link>
        {canApprove && contract.status === "DRAFT" ? (
          <form action={sendContractForSignature}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="contractId" value={contractId} />
            <details className="mt-2 w-full rounded-xl border border-neutral-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-900">
                Add additional signers (optional)
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">
                    Additional client emails
                  </span>
                  <textarea
                    name="additionalClientEmails"
                    rows={3}
                    className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="client2@email.com, client3@email.com"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">
                    Additional company emails
                  </span>
                  <textarea
                    name="additionalCompanyEmails"
                    rows={3}
                    className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="director@company.com, qs@company.com"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs leading-5 text-neutral-500">
                Signing order is enforced: all client parties sign first, then company parties.
              </p>
            </details>
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Send for Signature
            </button>
          </form>
        ) : null}
      </div>

      <ClientDeliveryActions
        returnTo={`/projects/${projectId}/contract/${contractId}`}
        projectId={projectId}
        documentType="CONTRACT"
        documentId={contractId}
        deliveryToken={deliveryToken}
      />

      <MessagingPanel
        returnTo={`/projects/${projectId}/contract/${contractId}`}
        projectId={projectId}
        relatedType="CONTRACT"
        relatedId={contractId}
        documentType="CONTRACT"
        documentId={contractId}
        defaultRecipientName={contract.clientNameSnapshot || null}
        defaultRecipientEmail={contract.clientEmailSnapshot || null}
        defaultRecipientPhone={contract.clientPhoneSnapshot || null}
        defaultSubject={`Contract ${contract.contractNumber} - ${contract.projectNameSnapshot}`}
        defaultBody={`Dear ${contract.clientNameSnapshot || "Client"},\n\nPlease review and sign contract ${contract.contractNumber} for ${contract.projectNameSnapshot}.\n\nThank you.`}
        defaultChannel="EMAIL"
      />

      <ActivityTimeline
        entityType="Contract"
        entityId={contractId}
        take={20}
        title="Contract Timeline"
        description="Drafting, clause edits, signature requests and deliveries."
      />

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">E-sign Requests</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Track sent, viewed, and signed states per party.
        </p>

        {signatureRequests.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-700">No signature requests yet.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {signatureRequests.map((req) => (
              <div key={req.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      Request {req.id.slice(0, 8)}
                    </p>
                    <p className="mt-1 text-sm text-neutral-700">
                      Status: <span className="font-semibold">{req.status}</span>
                      {req.sentAt ? ` · Sent ${formatDate(req.sentAt)}` : ""}
                      {req.expiresAt ? ` · Expires ${formatDate(req.expiresAt)}` : ""}
                    </p>
                  </div>
                  <span className="inline-flex rounded-lg bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
                    {req.status}
                  </span>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-neutral-600">
                      <tr>
                        <th className="py-2 text-left font-medium">Party</th>
                        <th className="py-2 text-left font-medium">Email</th>
                        <th className="py-2 text-left font-medium">Role</th>
                        <th className="py-2 text-left font-medium">Status</th>
                        <th className="py-2 text-left font-medium">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {req.parties.map((party) => (
                        <tr key={party.id} className="border-t border-neutral-200">
                          <td className="py-2 pr-4 font-medium text-neutral-900">{party.name}</td>
                          <td className="py-2 pr-4 text-neutral-700">{party.email}</td>
                          <td className="py-2 pr-4 text-neutral-700">{party.role}</td>
                          <td className="py-2 pr-4 text-neutral-900">{party.status}</td>
                          <td className="py-2">
                            <Link
                              href={`/sign/contracts/${req.id}/${party.id}`}
                              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {contract.milestones.length > 0 ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Contract Milestones</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Derived from quotation payment terms (used later for invoices).
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Title</th>
                  <th className="px-3 py-3 text-left font-semibold">Due</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {contract.milestones.map((m) => (
                  <tr key={m.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3 font-medium text-neutral-900">{m.title}</td>
                    <td className="px-3 py-3 text-neutral-700">{m.dueDate ? formatDate(m.dueDate) : "-"}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">
                      {formatCurrency(Number(m.amount))}
                    </td>
                    <td className="px-3 py-3 text-neutral-900">{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Contract Clauses</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Clauses are generated from templates at contract creation and can be edited while draft
          (where allowed). Clauses are locked once signed.
        </p>

        {contract.clauses.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-700">No clauses generated yet.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {contract.clauses.map((clause, idx) => (
              <div key={clause.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      {idx + 1}. {clause.title}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      Key: {clause.clauseKey} · {clause.isEditable ? "Editable" : "Locked clause"}
                    </p>
                  </div>
                  <span className="inline-flex rounded-lg bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
                    {contract.status}
                  </span>
                </div>

                {canWrite && clause.isEditable && contract.status === "DRAFT" && !contract.lockedAt ? (
                  <form action={updateContractClause} className="mt-4 grid gap-3">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="contractId" value={contractId} />
                    <input type="hidden" name="clauseId" value={clause.id} />
                    <textarea
                      name="content"
                      rows={6}
                      defaultValue={clause.content}
                      className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                    />
                    <div className="flex justify-end">
                      <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                        Save Clause
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                    {clause.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Legacy Terms Snapshot</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Kept for backward compatibility with earlier contract drafts.
        </p>
        <div className="mt-5 space-y-4 text-sm text-neutral-700">
          <TermBlock title="Terms & Conditions" value={contract.termsText} />
          <TermBlock title="Scope of Work" value={contract.scopeOfWork} />
          <TermBlock title="Payment Terms" value={contract.paymentTerms} />
          <TermBlock title="Warranty" value={contract.warrantyTerms} />
          <TermBlock title="Variation Policy" value={contract.variationPolicy} />
          <TermBlock title="Defects Policy" value={contract.defectsPolicy} />
          <TermBlock title="Insurance" value={contract.insurancePolicy} />
          <TermBlock title="Notes" value={contract.notes} />
        </div>
      </section>
    </main>
  );
}

function TermBlock(props: { title: string; value: string | null | undefined }) {
  if (!props.value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-1 whitespace-pre-wrap leading-6">{props.value}</p>
    </div>
  );
}
