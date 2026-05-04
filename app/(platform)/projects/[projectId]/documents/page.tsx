import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireDocumentCenterAccess, asPublicDocumentType, type DocumentKind } from "@/lib/documents/access";
import { listDocumentRegister } from "@/lib/documents/service";
import { generatePublicDocumentLinkAction, revokePublicDocumentLinksAction } from "@/app/(platform)/messaging/actions";
import { CopyLinkButton } from "@/app/(platform)/components/copy-link-button";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

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

function kindLabel(kind: DocumentKind): string {
  switch (kind) {
    case "DESIGN_PRESENTATION":
      return "Design Presentation";
    case "QUOTATION":
      return "Quotation";
    case "CONTRACT":
      return "Contract";
    case "INVOICE":
      return "Invoice";
    case "PURCHASE_ORDER":
      return "Purchase Order";
    case "SUBCONTRACT":
      return "Subcontract";
    case "SUPPLIER_BILL":
      return "Supplier Bill";
    case "VARIATION_ORDER":
      return "Variation Order";
    case "HANDOVER_FORM":
      return "Handover Form";
    default:
      return kind;
  }
}

function parseKind(value: string | string[] | undefined): DocumentKind | null {
  if (typeof value !== "string") return null;
  return ([
    "DESIGN_PRESENTATION",
    "QUOTATION",
    "CONTRACT",
    "INVOICE",
    "PURCHASE_ORDER",
    "SUBCONTRACT",
    "SUPPLIER_BILL",
    "VARIATION_ORDER",
    "HANDOVER_FORM",
  ] as const).includes(value as any)
    ? (value as DocumentKind)
    : null;
}

export default async function ProjectDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, projectCode: true },
  });
  if (!project) notFound();

  const user = requireDocumentCenterAccess(await requireUser());
  const sp = await searchParams;

  const selectedKind = parseKind(sp.kind);
  const status = typeof sp.status === "string" && sp.status.trim() ? sp.status.trim() : null;
  const signed =
    typeof sp.signed === "string" && ["signed", "unsigned"].includes(sp.signed) ? (sp.signed as any) : null;
  const sent =
    typeof sp.sent === "string" && ["sent", "not_sent"].includes(sp.sent) ? (sp.sent as any) : null;
  const expiredLinks =
    typeof sp.expired === "string" && ["expired", "active"].includes(sp.expired) ? (sp.expired as any) : null;

  const { page, pageSize, skip } = parsePagination(sp);

  const { items: rows, total } = await listDocumentRegister({
    user,
    take: 300,
    skip,
    pageSize,
    filters: {
      projectId,
      kind: selectedKind,
      status,
      signed,
      sent,
      expiredLinks,
    },
  });

  const baseParams = new URLSearchParams();
  if (selectedKind) baseParams.set("kind", selectedKind);
  if (status) baseParams.set("status", status);
  if (signed) baseParams.set("signed", signed);
  if (sent) baseParams.set("sent", sent);
  if (expiredLinks) baseParams.set("expired", expiredLinks);
  const hrefForPage = (n: number) => buildPageHref(`/projects/${projectId}/documents`, baseParams, n, pageSize);

  const canCommsWrite = user.permissions.includes(Permission.COMMS_WRITE);
  const returnTo = `/projects/${projectId}/documents?${new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
  ).toString()}`;

  return (
    <main className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Project / Documents
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {project.projectCode ? `${project.projectCode} · ` : ""}
              Document Register
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Central document hub for this project. Delivery and secure links are tracked per document.
            </p>
          </div>
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Back to Project
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Filters</h2>
        <form className="mt-5 grid gap-4 md:grid-cols-6">
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="font-medium text-neutral-800">Document Type</span>
            <select
              name="kind"
              defaultValue={selectedKind ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">All types</option>
              {Array.from(new Set(rows.map((r) => r.kind))).map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Signed</span>
            <select
              name="signed"
              defaultValue={signed ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">All</option>
              <option value="signed">Signed</option>
              <option value="unsigned">Unsigned</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Sent</span>
            <select
              name="sent"
              defaultValue={sent ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">All</option>
              <option value="sent">Sent</option>
              <option value="not_sent">Not sent</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="font-medium text-neutral-800">Status (exact)</span>
            <input
              name="status"
              defaultValue={status ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. SIGNED / SENT / DRAFT"
            />
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="font-medium text-neutral-800">Secure Link</span>
            <select
              name="expired"
              defaultValue={expiredLinks ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">All</option>
              <option value="active">Active link (not expired)</option>
              <option value="expired">Expired link</option>
            </select>
          </label>
          <div className="md:col-span-6 flex justify-end">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Apply
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Documents</h2>
          <p className="mt-1 text-sm text-neutral-600">{total} records.</p>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No documents found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1300px] w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">No.</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Client/Supplier</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Ver</th>
                  <th className="px-4 py-3 text-left font-semibold">Created</th>
                  <th className="px-4 py-3 text-left font-semibold">Sent</th>
                  <th className="px-4 py-3 text-left font-semibold">Viewed</th>
                  <th className="px-4 py-3 text-left font-semibold">Signed</th>
                  <th className="px-4 py-3 text-left font-semibold">Expiry</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const publicType = asPublicDocumentType(r.kind);
                  const canLink = canCommsWrite && Boolean(publicType);

                  return (
                    <tr key={`${r.kind}:${r.recordId}`} className="border-t border-neutral-200 bg-white">
                      <td className="px-4 py-3 font-medium text-neutral-950">{r.documentNumber}</td>
                      <td className="px-4 py-3 text-neutral-700">{kindLabel(r.kind)}</td>
                      <td className="px-4 py-3 text-neutral-700">{r.counterpartyLabel ?? "-"}</td>
                      <td className="px-4 py-3 text-neutral-700">{r.status}</td>
                      <td className="px-4 py-3 text-right text-neutral-700">{r.version ?? "-"}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatDateTime(r.createdAt)}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatDateTime(r.sentAt)}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatDateTime(r.viewedAt)}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatDateTime(r.signedAt)}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatDateTime(r.expiresAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={r.previewUrl}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-100"
                          >
                            Preview
                          </Link>
                          {r.printUrl ? (
                            <Link
                              href={r.printUrl}
                              className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-100"
                            >
                              Print
                            </Link>
                          ) : null}
                          {canLink && r.secureLinkUrl ? (
                            <CopyLinkButton text={r.secureLinkUrl} label="Copy link" />
                          ) : null}
                          {canCommsWrite && publicType ? (
                            <details className="relative">
                              <summary className="inline-flex h-9 cursor-pointer list-none items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-100">
                                More
                              </summary>
                              <div className="absolute right-0 z-10 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
                                <div className="p-2">
                                  <form action={generatePublicDocumentLinkAction}>
                                    <input type="hidden" name="returnTo" value={returnTo} />
                                    <input type="hidden" name="projectId" value={projectId} />
                                    <input type="hidden" name="documentType" value={publicType} />
                                    <input type="hidden" name="documentId" value={r.recordId} />
                                    <input type="hidden" name="expiresInDays" value="14" />
                                    <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-neutral-900 hover:bg-neutral-50">
                                      {r.secureLinkUrl ? "Generate new link" : "Generate link"}
                                    </button>
                                  </form>
                                  <form action={revokePublicDocumentLinksAction}>
                                    <input type="hidden" name="returnTo" value={returnTo} />
                                    <input type="hidden" name="projectId" value={projectId} />
                                    <input type="hidden" name="documentType" value={publicType} />
                                    <input type="hidden" name="documentId" value={r.recordId} />
                                    <button className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">
                                      Revoke links
                                    </button>
                                  </form>
                                </div>
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-neutral-200 px-6 py-4">
          <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </section>
    </main>
  );
}
