import Link from "next/link";
import { Suspense } from "react";
import {
  GebizOpportunitiesWidget,
  GebizOpportunitiesWidgetSkeleton,
} from "@/app/components/dashboard/gebiz-opportunities-widget";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";

type Card = {
  href: string;
  title: string;
  description: string;
  badge?: string;
};

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Dashboard must never crash on optional modules / missing tables / empty DB.
    console.error("[dashboard] data query failed:", err);
    return fallback;
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

const primaryCards: Card[] = [
  { href: "/leads", title: "Leads Pipeline", description: "Sales pipeline for qualification, site visits, and conversion to projects." },
  { href: "/leads/new", title: "New Lead", description: "Create a new lead record and start follow-up." },
  { href: "/bidding", title: "Bidding", description: "GeBIZ tender and quotation opportunities, costing, documents, and approvals." },
  { href: "/command-center", title: "Command Center", description: "Owner/director dashboard for full business health (ADMIN/DIRECTOR only)." },
  { href: "/ai-control-center", title: "AI Control Center", description: "Automation safety controls and approval rules (ADMIN/DIRECTOR only)." },
  { href: "/ai-actions", title: "AI Actions", description: "Approval queue for AI-recommended actions (ADMIN/DIRECTOR only)." },
  { href: "/ai-learning", title: "AI Learning", description: "Outcome tracking and scoring for AI recommendations (ADMIN/DIRECTOR only)." },
  { href: "/sales", title: "Sales Dashboard", description: "Design-to-sales pipeline visibility, conversion metrics, and package readiness." },
  { href: "/sales/assistant", title: "Sales Assistant", description: "AI-assisted lead qualification, follow-ups, pitches, and draft messages (review-only)." },
  { href: "/projects", title: "Projects", description: "Open the live project register and continue active work." },
  { href: "/projects/new", title: "New Project", description: "Create a new project record and start the workflow." },
  { href: "/documents", title: "Documents", description: "Central register for client-facing and generated project documents." },
  { href: "/design-packages", title: "Design Packages", description: "Reusable packages, room templates, and BOQ templates to accelerate quotation creation." },
  { href: "/suppliers", title: "Suppliers", description: "Manage the supplier and subcontractor master records." },
  { href: "/collections", title: "Collections", description: "Overdue receivables, chasing workflow, and case management." },
  { href: "/cashflow", title: "Cashflow", description: "Company cashflow forecast across invoices, billing stages, and supplier exposure." },
  { href: "/settings/security", title: "Security", description: "Security center, password, and active sessions." },
  { href: "/settings/accounting", title: "Accounting", description: "Xero-ready accounting sync mappings, tax codes, and sync logs." },
];

const workflowCards: Card[] = [
  {
    href: "/projects",
    title: "Design Workflow",
    badge: "Project Module",
    description: "Open a project to manage design briefs, room-by-room collaboration, QS BOQ drafts, and push to quotation.",
  },
  {
    href: "/projects",
    title: "Quotations",
    badge: "Project Module",
    description: "Open a project to access project-linked quotations and BOQ costing.",
  },
  {
    href: "/projects",
    title: "Contracts",
    badge: "Project Module",
    description: "Open a project to generate and e-sign contracts from accepted quotations.",
  },
  {
    href: "/projects",
    title: "Billing",
    badge: "Project Module",
    description: "Open a project to manage payment schedules and progressive billing controls.",
  },
  {
    href: "/projects",
    title: "Invoices",
    badge: "Project Module",
    description: "Open a project to view invoices, print, and record collections.",
  },
  {
    href: "/projects",
    title: "Receipts",
    badge: "Project Module",
    description: "Open a project to record receipts and track collected payments.",
  },
  {
    href: "/projects",
    title: "Communications",
    badge: "Project Module",
    description: "Open a project to view correspondence logs and outbound message history.",
  },
  {
    href: "/projects",
    title: "Purchase Orders",
    badge: "Project Module",
    description: "Open a project to issue purchase orders and track committed costs.",
  },
  {
    href: "/projects",
    title: "Subcontracts",
    badge: "Project Module",
    description: "Open a project to manage subcontracts, claims, and controls.",
  },
  {
    href: "/projects",
    title: "Supplier Bills",
    badge: "Project Module",
    description: "Open a project to record supplier bills and actual costs.",
  },
  {
    href: "/projects",
    title: "P&L",
    badge: "Project Module",
    description: "Open a project to view profitability, alerts, and margin leakage signals.",
  },
  {
    href: "/quotation",
    title: "Legacy Quotations",
    description: "Older quotation workflow (non-project linked).",
  },
];

export default async function DashboardPage() {
  // Auth is enforced by the (platform) layout, but keep this explicit to avoid
  // running any data queries for unauthenticated requests.
  const user = await requireUser();
  const canCommandCenter = user.isAdmin || user.roleKeys.includes("DIRECTOR");

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const closingSoonCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const prismaAny = prisma as unknown as Record<string, any>;
  const aiActionLogDelegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog ?? null;

  const [
    projectCount,
    leadCount,
    invoiceOutstandingTotal,
    aiActionsPendingApproval,
    recentProjects,
    recentLeads,
    newOpportunitiesCount,
    highFitCount,
    closingSoonCount,
    pipelineValueTotal,
  ] = await Promise.all([
    safeQuery(() => prisma.project.count(), 0),
    safeQuery(() => prisma.lead.count(), 0),
    safeQuery(async () => {
      const agg = await prisma.invoice.aggregate({
        _sum: { outstandingAmount: true },
        where: {
          outstandingAmount: { gt: 0 },
          status: { notIn: ["VOID"] },
        },
      });
      return Number(agg._sum.outstandingAmount ?? 0);
    }, 0),
    safeQuery(async () => {
      if (!canCommandCenter || !aiActionLogDelegate || typeof aiActionLogDelegate.count !== "function") return 0;
      return (await aiActionLogDelegate.count({
        where: { status: { in: ["PENDING", "APPROVAL_REQUIRED", "APPROVED"] } },
      })) as number;
    }, 0),
    safeQuery(
      () =>
        prisma.project.findMany({
          orderBy: [{ updatedAt: "desc" }],
          take: 5,
          select: {
            id: true,
            projectCode: true,
            name: true,
            status: true,
            updatedAt: true,
          },
        }),
      [] as Array<{ id: string; projectCode: string | null; name: string; status: string; updatedAt: Date }>,
    ),
    safeQuery(
      () =>
        prisma.lead.findMany({
          orderBy: [{ createdAt: "desc" }],
          take: 5,
          select: {
            id: true,
            leadNumber: true,
            customerName: true,
            status: true,
            createdAt: true,
          },
        }),
      [] as Array<{ id: string; leadNumber: string; customerName: string; status: string; createdAt: Date }>,
    ),
    safeQuery(
      () =>
        prisma.bidOpportunity.count({
          where: {
            status: "WATCHING",
            createdAt: { gte: sevenDaysAgo },
            gebizImportedItems: { some: {} },
          },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.bidOpportunity.count({
          where: {
            status: { in: ["WATCHING", "PREPARING", "PENDING_APPROVAL"] },
            fitLabel: "HIGH",
          },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.bidOpportunity.count({
          where: {
            status: { in: ["WATCHING", "PREPARING", "PENDING_APPROVAL"] },
            closingDate: { lte: closingSoonCutoff },
          },
        }),
      0,
    ),
    safeQuery(async () => {
      const agg = await prisma.bidOpportunity.aggregate({
        _sum: { estimatedValue: true },
        where: { status: { in: ["PREPARING", "PENDING_APPROVAL", "SUBMITTED"] } },
      });
      return Number(agg._sum.estimatedValue ?? 0);
    }, 0),
  ]);

  const primary = primaryCards.map((c) => {
    if (c.title === "Projects") return { ...c, badge: `Total: ${projectCount}` };
    if (c.title === "Leads Pipeline") return { ...c, badge: `Leads: ${leadCount}` };
    if (c.title === "Collections") return { ...c, badge: `Outstanding: ${formatCurrency(invoiceOutstandingTotal)}` };
    if (c.title === "AI Actions") return { ...c, badge: `Pending: ${aiActionsPendingApproval}` };
    return c;
  });

  const primaryWithExecGate = primary.filter((c) => {
    if (c.title === "Command Center" || c.title === "AI Control Center" || c.title === "AI Actions" || c.title === "AI Learning") return canCommandCenter;
    return true;
  });

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Platform"
        title="Dashboard"
        subtitle="Fast overview and quick navigation. Deeper analytics and risk controls live in Command Center."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/projects/new">
              <ActionButton>New Project</ActionButton>
            </Link>
            <Link href="/leads/new">
              <ActionButton variant="secondary">New Lead</ActionButton>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile title="Projects" value={String(projectCount)} href="/projects" />
        <MetricTile title="Leads" value={String(leadCount)} href="/leads" />
        <MetricTile title="Outstanding Receivables" value={formatCurrency(invoiceOutstandingTotal)} href="/collections" />
        <MetricTile
          title="AI Actions Pending"
          value={canCommandCenter ? String(aiActionsPendingApproval) : "-"}
          href={canCommandCenter ? "/ai-actions" : "/dashboard"}
        />
      </section>

      <SectionCard
        title="Tender Intelligence"
        description="GeBIZ tender radar (last 7 days), high-fit opportunities, and closing-soon risk. Open Bidding for deep analysis."
        actions={
          <Link href="/bidding/opportunities" className="text-sm font-semibold text-neutral-900 hover:underline">
            Open GeBIZ opportunities
          </Link>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile title="New Opportunities" value={String(newOpportunitiesCount)} href="/bidding/opportunities?source=GEBIZ&status=WATCHING" />
          <MetricTile title="High Fit" value={String(highFitCount)} href="/bidding/opportunities?fit=HIGH" />
          <MetricTile title="Closing ≤ 7 Days" value={String(closingSoonCount)} href="/bidding/opportunities?deadline=HIGH" />
          <MetricTile title="Pipeline Value" value={formatCurrency(pipelineValueTotal)} href="/bidding/pipeline" />
        </div>
      </SectionCard>

      <Suspense fallback={<GebizOpportunitiesWidgetSkeleton />}>
        <GebizOpportunitiesWidget />
      </Suspense>

      <SectionCard
        title="Quick Access"
        description="Core navigation and key workflows. Project modules require selecting a project first."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {primaryWithExecGate.map((card) => (
            <DashboardCard key={card.title} card={card} />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Project Workflow"
        description="Open a project to access quotations, contracts, billing, invoices, suppliers, and project P&L."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflowCards.map((card) => (
            <DashboardCard key={card.title} card={card} />
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Recent Projects"
          actions={
            <Link href="/projects" className="text-sm font-semibold text-neutral-900 hover:underline">
              Open projects
            </Link>
          }
        >
          {recentProjects.length === 0 ? (
            <EmptyState title="No projects yet" description="Create a project to start managing quotations, contracts, and delivery." ctaLabel="New Project" ctaHref="/projects/new" />
          ) : (
            <div className="space-y-3">
              {recentProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-950">
                      {p.projectCode ? `${p.projectCode} · ` : ""}
                      {p.name}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      Updated{" "}
                      {new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(p.updatedAt)}
                    </p>
                  </div>
                  <StatusPill tone="info">{p.status}</StatusPill>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent Leads"
          actions={
            <Link href="/leads" className="text-sm font-semibold text-neutral-900 hover:underline">
              Open leads
            </Link>
          }
        >
          {recentLeads.length === 0 ? (
            <EmptyState title="No leads yet" description="Capture your first lead to start the sales pipeline and schedule site visits." ctaLabel="New Lead" ctaHref="/leads/new" />
          ) : (
            <div className="space-y-3">
              {recentLeads.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-950">{l.customerName}</p>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      {l.leadNumber} ·{" "}
                      {new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(l.createdAt)}
                    </p>
                  </div>
                  <StatusPill tone="neutral">{l.status}</StatusPill>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}

function DashboardCard({ card }: { card: Card }) {
  return (
    <Link
      href={card.href}
      className="group rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:bg-stone-50"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold tracking-tight text-neutral-950">{card.title}</p>
        {card.badge ? (
          <StatusPill tone="neutral">{card.badge}</StatusPill>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{card.description}</p>
      <p className="mt-4 text-sm font-semibold text-neutral-900 opacity-0 transition group-hover:opacity-100">
        Open →
      </p>
    </Link>
  );
}

function MetricTile(props: { title: string; value: string; href: string }) {
  return (
    <Link
      href={props.href}
      className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:bg-stone-50"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950 tabular-nums">{props.value}</p>
      <p className="mt-2 text-sm text-neutral-600">Open</p>
    </Link>
  );
}
