import Link from "next/link";
import { type LeadStatus, type ResidentialPropertyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { requireLeadsModuleAccess } from "@/lib/leads/access";
import { computeLeadPipelineSummary, listLeadsForViewer } from "@/lib/leads/service";
import { LeadStatusBadge } from "@/app/(platform)/leads/components/lead-status-badge";
import {
  convertLeadToProjectAction,
  convertLeadToQuotationAction,
  quickUpdateLeadAction,
} from "@/app/(platform)/leads/actions";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ActionButton } from "@/app/components/ui/action-button";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

const fieldClass = "mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none ring-neutral-400 transition focus:ring-2";
const compactSelectClass = "h-10 rounded-2xl border border-slate-200 bg-white px-2 text-xs outline-none ring-neutral-400 focus:ring-2";
const compactStrongSelectClass = "h-10 rounded-2xl border border-slate-200 bg-white px-2 text-xs font-semibold outline-none ring-neutral-400 focus:ring-2";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function formatCurrency(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(n);
}

export default async function LeadsIndexPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuthenticatedSession();
  requireLeadsModuleAccess(session.user);

  const params = await props.searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const statusParam = typeof params.status === "string" ? params.status : "ALL";
  const assignedSalesEmail = typeof params.sales === "string" ? params.sales : "";
  const rptParam = typeof params.rpt === "string" ? params.rpt : "ALL";

  const status = (statusParam === "ALL" ? "ALL" : (statusParam as LeadStatus)) as LeadStatus | "ALL";
  const residentialPropertyType = (rptParam === "ALL"
    ? "ALL"
    : (rptParam as ResidentialPropertyType)) as ResidentialPropertyType | "ALL";

  const { page, pageSize, skip, take } = parsePagination(params);

  const isExec = session.user.isAdmin || session.user.roleKeys.includes("DIRECTOR");
  const canProjectWrite = session.user.permissions.includes("PROJECT_WRITE");
  const canQuoteWrite = session.user.permissions.includes("QUOTE_WRITE");

  const [summary, leadsPage, assignableUsers] = await Promise.all([
    computeLeadPipelineSummary(session.user),
    listLeadsForViewer({
      viewer: session.user,
      filters: {
        search: q,
        status,
        assignedSalesEmail: assignedSalesEmail || undefined,
        residentialPropertyType,
      },
      skip,
      take,
    }),
    isExec
      ? prisma.user.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ name: "asc" }, { email: "asc" }],
          take: 200,
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string | null; email: string }>),
  ]);
  const leads = leadsPage.items;
  const total = leadsPage.total;

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (statusParam !== "ALL") baseParams.set("status", statusParam);
  if (assignedSalesEmail) baseParams.set("sales", assignedSalesEmail);
  if (rptParam !== "ALL") baseParams.set("rpt", rptParam);
  const hrefForPage = (n: number) => buildPageHref("/leads", baseParams, n, pageSize);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Sales Pipeline"
        title="Leads"
        subtitle="Capture customer requirements, schedule follow-ups, and convert qualified leads into projects."
        actions={<Link href="/leads/new"><ActionButton>New Lead</ActionButton></Link>}
      />

      <SectionCard title="Filters" description="Search by lead no, customer, contact, address, or salesperson.">
        <form className="grid gap-4 sm:grid-cols-6">
          <label className="block sm:col-span-2">
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Search</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Lead no, customer, email, phone…"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Status</span>
            <select
              name="status"
              defaultValue={statusParam}
              className={fieldClass}
            >
              <option value="ALL">ALL</option>
              <option value="NEW">NEW</option>
              <option value="CONTACTED">CONTACTED</option>
              <option value="QUALIFYING">QUALIFYING</option>
              <option value="SITE_VISIT_SCHEDULED">SITE_VISIT_SCHEDULED</option>
              <option value="QUOTATION_PENDING">QUOTATION_PENDING</option>
              <option value="CONVERTED">CONVERTED</option>
              <option value="LOST">LOST</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Sales Email</span>
            <input
              name="sales"
              defaultValue={assignedSalesEmail}
              placeholder="sales@company.com"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Residential Type</span>
            <select
              name="rpt"
              defaultValue={rptParam}
              className={fieldClass}
            >
              <option value="ALL">ALL</option>
              <option value="HDB">HDB</option>
              <option value="CONDO">CONDO</option>
              <option value="LANDED">LANDED</option>
            </select>
          </label>

          <div className="flex items-end gap-2 sm:col-span-6">
            <ActionButton type="submit">Apply</ActionButton>
            <Link href="/leads"><ActionButton type="button" variant="secondary">Reset</ActionButton></Link>
          </div>
        </form>
      </SectionCard>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard title="New Leads" value={summary.newLeads} tone="info" />
        <SummaryCard title="Contacted" value={summary.contacted} />
        <SummaryCard title="Site Visits" value={summary.siteVisits} tone="warning" />
        <SummaryCard title="Quotation Pending" value={summary.quotationPending} tone="warning" />
        <SummaryCard title="Converted" value={summary.converted} tone="success" />
      </section>

      <SectionCard title="Lead Register" description="Update status, assign owners, and convert leads into projects and quotations.">
        <div className="space-y-4">
        {leads.length === 0 ? (
          <EmptyState
            title="No leads found"
            description={q || statusParam !== "ALL" ? "Try adjusting your filters." : "Create your first lead to start the pipeline."}
            ctaLabel="Create Lead"
            ctaHref="/leads/new"
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  isExec={isExec}
                  assignableUsers={assignableUsers}
                  canProjectWrite={canProjectWrite}
                  canQuoteWrite={canQuoteWrite}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[1180px] overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-50 text-neutral-700">
                    <tr>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Source</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Customer</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Project</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Budget</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Submitted</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Assigned</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Status</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Created</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-t border-slate-200">
                        <td className="px-4 py-4 text-neutral-900">
                          <div className="flex flex-col">
                            <span className="font-semibold">{lead.source}</span>
                            <span className="text-xs text-neutral-500">{lead.leadNumber}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-neutral-900">
                          <div className="flex flex-col">
                            <span className="font-semibold">{lead.customerName}</span>
                            <span className="text-xs text-neutral-500">
                              {lead.customerPhone ?? "-"} · {lead.customerEmail ?? "-"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-neutral-900">
                          <div className="flex flex-col">
                            <span className="font-semibold">{lead.projectType}</span>
                            <span className="text-xs text-neutral-500">
                              {lead.propertyType ?? lead.residentialPropertyType ?? "-"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">
                          {lead.estimatedBudget ? formatCurrency(Number(lead.estimatedBudget)) : "-"}
                        </td>
                        <td className="px-4 py-4 text-neutral-700">
                          {lead.submittedByUser ? (
                            <div className="flex flex-col">
                              <span className="font-semibold text-neutral-900">
                                {lead.submittedByUser.name ?? lead.submittedByUser.email}
                              </span>
                              <span className="text-xs text-neutral-500">{lead.submittedByUser.email}</span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-4 text-neutral-700">
                          {lead.assignedToUser ? (
                            <div className="flex flex-col">
                              <span className="font-semibold text-neutral-900">
                                {lead.assignedToUser.name ?? lead.assignedToUser.email}
                              </span>
                              <span className="text-xs text-neutral-500">{lead.assignedToUser.email}</span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {isExec ? (
                            <form action={quickUpdateLeadAction} className="flex items-center gap-2">
                              <input type="hidden" name="leadId" value={lead.id} />
                              <select
                                name="status"
                                defaultValue={lead.status}
                                className={compactStrongSelectClass}
                              >
                                <option value="NEW">NEW</option>
                                <option value="CONTACTED">CONTACTED</option>
                                <option value="QUALIFYING">QUALIFYING</option>
                                <option value="SITE_VISIT_SCHEDULED">SITE_VISIT_SCHEDULED</option>
                                <option value="QUOTATION_PENDING">QUOTATION_PENDING</option>
                                <option value="CONVERTED">CONVERTED</option>
                                <option value="LOST">LOST</option>
                              </select>
                              <ActionButton size="sm" type="submit">
                                Save
                              </ActionButton>
                            </form>
                          ) : (
                            <LeadStatusBadge status={lead.status} />
                          )}
                        </td>
                        <td className="px-4 py-4 text-neutral-700 tabular-nums">{formatDate(lead.createdAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/leads/${lead.id}`}>
                              <ActionButton variant="secondary" size="sm">
                                View
                              </ActionButton>
                            </Link>
                            {lead.convertedProjectId ? (
                              <Link href={`/projects/${lead.convertedProjectId}`}>
                                <ActionButton variant="secondary" size="sm">
                                  Project
                                </ActionButton>
                              </Link>
                            ) : null}
                            {canProjectWrite && !lead.convertedProjectId && lead.status !== "LOST" ? (
                              <form action={convertLeadToProjectAction}>
                                <input type="hidden" name="leadId" value={lead.id} />
                                <ActionButton size="sm" type="submit">
                                  Convert
                                </ActionButton>
                              </form>
                            ) : null}
                            {canQuoteWrite && lead.status !== "LOST" ? (
                              <form action={convertLeadToQuotationAction}>
                                <input type="hidden" name="leadId" value={lead.id} />
                                <ActionButton size="sm" variant="secondary" type="submit">
                                  Quotation
                                </ActionButton>
                              </form>
                            ) : null}
                            {isExec ? (
                              <form action={quickUpdateLeadAction} className="flex items-center gap-2">
                                <input type="hidden" name="leadId" value={lead.id} />
                                <select
                                  name="assignedToUserId"
                                  defaultValue={lead.assignedToUserId ?? ""}
                                  className={compactSelectClass}
                                >
                                  <option value="">Unassigned</option>
                                  {assignableUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name ?? u.email}
                                    </option>
                                  ))}
                                </select>
                                <ActionButton size="sm" variant="secondary" type="submit">
                                  Assign
                                </ActionButton>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </SectionCard>
    </main>
  );
}

function SummaryCard(props: {
  title: string;
  value: number;
  tone?: Parameters<typeof StatusPill>[0]["tone"];
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">{props.title}</p>
        <StatusPill tone={props.tone ?? "neutral"}>{String(props.value)}</StatusPill>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 tabular-nums">{props.value}</p>
    </div>
  );
}

function LeadCard(props: {
  lead: Awaited<ReturnType<typeof listLeadsForViewer>>["items"][number];
  isExec: boolean;
  assignableUsers: Array<{ id: string; name: string | null; email: string }>;
  canProjectWrite: boolean;
  canQuoteWrite: boolean;
}) {
  const lead = props.lead;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-neutral-950">{lead.customerName}</p>
          <p className="mt-1 text-xs text-neutral-600">
            {lead.leadNumber} · {lead.source}
          </p>
        </div>
        <LeadStatusBadge status={lead.status} />
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <div className="rounded-2xl border border-slate-200 bg-stone-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Contact</p>
          <p className="mt-1 font-semibold text-neutral-950">{lead.customerPhone ?? "-"}</p>
          <p className="mt-0.5 text-xs text-neutral-600">{lead.customerEmail ?? "-"}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-stone-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Type</p>
            <p className="mt-1 font-semibold text-neutral-950">{lead.projectType}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-stone-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Budget</p>
            <p className="mt-1 font-semibold text-neutral-950 tabular-nums">
              {lead.estimatedBudget ? formatCurrency(Number(lead.estimatedBudget)) : "-"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-stone-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Submitted</p>
            <p className="mt-1 font-semibold text-neutral-950">
              {lead.submittedByUser?.name ?? lead.submittedByUser?.email ?? "-"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-stone-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Assigned</p>
            <p className="mt-1 font-semibold text-neutral-950">
              {lead.assignedToUser?.name ?? lead.assignedToUser?.email ?? "-"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/leads/${lead.id}`}><ActionButton size="sm" variant="secondary">View</ActionButton></Link>

          {lead.convertedProjectId ? (
            <Link href={`/projects/${lead.convertedProjectId}`}><ActionButton size="sm" variant="secondary">Project</ActionButton></Link>
          ) : null}

          {props.canProjectWrite && !lead.convertedProjectId && lead.status !== "LOST" ? (
            <form action={convertLeadToProjectAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <ActionButton size="sm" type="submit">
                Convert
              </ActionButton>
            </form>
          ) : null}

          {props.canQuoteWrite && lead.status !== "LOST" ? (
            <form action={convertLeadToQuotationAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <ActionButton size="sm" type="submit" variant="secondary">
                Quotation
              </ActionButton>
            </form>
          ) : null}
        </div>

        {props.isExec ? (
          <div className="grid gap-2">
            <form action={quickUpdateLeadAction} className="flex items-center gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <select
                name="status"
                defaultValue={lead.status}
                className={`${compactStrongSelectClass} flex-1`}
              >
                <option value="NEW">NEW</option>
                <option value="CONTACTED">CONTACTED</option>
                <option value="QUALIFYING">QUALIFYING</option>
                <option value="SITE_VISIT_SCHEDULED">SITE_VISIT_SCHEDULED</option>
                <option value="QUOTATION_PENDING">QUOTATION_PENDING</option>
                <option value="CONVERTED">CONVERTED</option>
                <option value="LOST">LOST</option>
              </select>
              <ActionButton size="sm" type="submit">
                Save
              </ActionButton>
            </form>

            <form action={quickUpdateLeadAction} className="flex items-center gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <select
                name="assignedToUserId"
                defaultValue={lead.assignedToUserId ?? ""}
                className={`${compactSelectClass} flex-1`}
              >
                <option value="">Unassigned</option>
                {props.assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </select>
              <ActionButton size="sm" variant="secondary" type="submit">
                Assign
              </ActionButton>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
