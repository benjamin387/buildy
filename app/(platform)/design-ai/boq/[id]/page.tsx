import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  createQuotationFromDesignBOQ,
  deleteDesignBOQItem,
  updateDesignBOQItem,
} from "@/app/(platform)/design-ai/actions";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";

const RISK_OPTIONS = ["LOW", "MEDIUM", "HIGH"] as const;

export default async function DesignBoqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const boq = await prisma.designBOQ.findUnique({
    where: { id },
    include: {
      designBrief: {
        select: {
          id: true,
          clientName: true,
          propertyType: true,
          projectId: true,
        },
      },
      designConcept: { select: { id: true, title: true } },
      items: { orderBy: [{ room: "asc" }, { category: "asc" }, { sortOrder: "asc" }] },
    },
  });

  if (!boq) notFound();

  const groupedByRoom = groupBy(boq.items, (item) => item.room);
  const groupedByCategory = groupBy(boq.items, (item) => item.category);

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title={boq.title}
        subtitle="Excel-style editable BOQ with live commercial totals and quotation conversion."
        backHref="/design-ai/boq"
        actions={<StatusPill tone={boq.status === "CONVERTED" ? "success" : "warning"}>{boq.status}</StatusPill>}
      />

      <SectionCard title="Summary">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Info label="Client" value={boq.designBrief.clientName || "-"} />
          <Info label="Property Type" value={boq.designBrief.propertyType} />
          <Info label="Concept" value={boq.designConcept.title} />
          <Info label="BOQ Items" value={String(boq.items.length)} />
          <Info label="Total Cost" value={money(boq.totalCost)} />
          <Info label="Total Selling" value={money(boq.totalSellingPrice)} />
          <Info label="Gross Profit" value={money(boq.grossProfit)} />
          <Info label="Gross Margin" value={`${Number(boq.grossMargin).toFixed(2)}%`} />
        </div>

        {boq.aiRiskNotes ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900">AI Risk Notes</p>
            <p className="mt-1 text-sm leading-6 text-amber-800">{boq.aiRiskNotes}</p>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Room Grouping">
        <div className="flex flex-wrap gap-2">
          {Object.entries(groupedByRoom).map(([room, items]) => (
            <span key={room} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {room} ({items.length})
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Category Grouping">
        <div className="flex flex-wrap gap-2">
          {Object.entries(groupedByCategory).map(([category, items]) => (
            <span key={category} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {category} ({items.length})
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Editable BOQ Table" description="Update rows inline and save per row.">
        <div className="space-y-4">
          {boq.items.map((item) => (
            <form key={item.id} action={updateDesignBOQItem} className="rounded-xl border border-slate-200 bg-white p-4">
              <input type="hidden" name="boqId" value={boq.id} />
              <input type="hidden" name="itemId" value={item.id} />

              <div className="grid gap-3 lg:grid-cols-12">
                <Cell label="Room" className="lg:col-span-2"><input name="room" defaultValue={item.room} className={inputCls} required /></Cell>
                <Cell label="Category" className="lg:col-span-2"><input name="category" defaultValue={item.category} className={inputCls} required /></Cell>
                <Cell label="Description" className="lg:col-span-3"><input name="description" defaultValue={item.description} className={inputCls} required /></Cell>
                <Cell label="Qty" className="lg:col-span-1"><input name="quantity" type="number" step="0.01" min="0" defaultValue={Number(item.quantity)} className={inputCls} required /></Cell>
                <Cell label="Unit" className="lg:col-span-1"><input name="unit" defaultValue={item.unit} className={inputCls} required /></Cell>
                <Cell label="Cost Rate" className="lg:col-span-1"><input name="costRate" type="number" step="0.01" min="0" defaultValue={Number(item.costRate)} className={inputCls} required /></Cell>
                <Cell label="Selling Rate" className="lg:col-span-1"><input name="sellingRate" type="number" step="0.01" min="0" defaultValue={Number(item.sellingRate)} className={inputCls} required /></Cell>
                <Cell label="Risk" className="lg:col-span-1">
                  <select name="riskLevel" defaultValue={(item.riskLevel || "MEDIUM").toUpperCase()} className={inputCls}>
                    {RISK_OPTIONS.map((risk) => <option key={risk} value={risk}>{risk}</option>)}
                  </select>
                </Cell>
                <Cell label="Supplier Type" className="lg:col-span-2"><input name="supplierType" defaultValue={item.supplierType || ""} className={inputCls} /></Cell>
                <Cell label="AI Notes" className="lg:col-span-6"><input name="aiNotes" defaultValue={item.aiNotes || ""} className={inputCls} /></Cell>
                <Cell label="Total Cost" className="lg:col-span-2"><ReadOnly value={money(item.totalCost)} /></Cell>
                <Cell label="Total Selling" className="lg:col-span-2"><ReadOnly value={money(item.totalSellingPrice)} /></Cell>
                <Cell label="Margin %" className="lg:col-span-2">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold">
                    <span>{Number(item.margin).toFixed(2)}%</span>
                    <RiskBadge riskLevel={(item.riskLevel || "MEDIUM").toUpperCase()} />
                  </div>
                </Cell>
                <div className="lg:col-span-12 flex flex-wrap items-center justify-end gap-2">
                  <ActionButton type="submit" size="sm">Save Row</ActionButton>
                  <button
                    formAction={deleteDesignBOQItem}
                    className="inline-flex h-9 items-center rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    Delete Row
                  </button>
                </div>
              </div>
            </form>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Conversion Flow">
        <p className="text-sm text-neutral-700">
          DesignBrief <span className="font-semibold">→</span> DesignConcept <span className="font-semibold">→</span> DesignBOQ <span className="font-semibold">→</span> Quotation
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={createQuotationFromDesignBOQ}>
            <input type="hidden" name="boqId" value={boq.id} />
            <ActionButton type="submit" disabled={!boq.designBrief.projectId}>Create Quotation</ActionButton>
          </form>
          <Link href={`/design-ai/briefs/${boq.designBrief.id}`} className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 hover:bg-slate-50">
            Open Design Brief
          </Link>
        </div>
        {!boq.designBrief.projectId ? (
          <p className="mt-2 text-xs text-amber-700">This design brief is not linked to a project yet, so quotation conversion is disabled.</p>
        ) : null}
      </SectionCard>
    </main>
  );
}

const inputCls = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-neutral-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

function Cell(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={props.className}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{props.label}</span>
      {props.children}
    </label>
  );
}

function Info(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</p>
      <p className="mt-1 text-sm text-neutral-900">{props.value}</p>
    </div>
  );
}

function ReadOnly(props: { value: string }) {
  return <div className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-neutral-700">{props.value}</div>;
}

function RiskBadge(props: { riskLevel: string }) {
  const tone = props.riskLevel === "HIGH" ? "danger" : props.riskLevel === "LOW" ? "success" : "warning";
  return <StatusPill tone={tone as "danger" | "success" | "warning"}>{props.riskLevel}</StatusPill>;
}

function money(value: { toString(): string } | number): string {
  return `$${Number(value.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}
