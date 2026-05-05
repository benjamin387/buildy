import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { upsertBidCostItemAction, deleteBidCostItemAction } from "@/app/(platform)/bidding/actions";
import { safeQuery } from "@/lib/server/safe-query";

const CATEGORIES = [
  "MATERIAL",
  "LABOUR",
  "SUBCONTRACTOR",
  "PRELIMINARIES",
  "OVERHEAD",
  "CONTINGENCY",
  "OTHER",
] as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

export const dynamic = "force-dynamic";

export default async function BidCostingPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id } = await props.params;

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id },
        include: {
          costItems: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] },
        },
      }),
    null as any,
  );
  if (!opp) notFound();

  const byCat = new Map<string, any[]>();
  for (const c of CATEGORIES) byCat.set(c, []);
  for (const row of opp.costItems ?? []) {
    const k = String(row.category);
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(row);
  }

  const totalSell = Number(opp.bidPrice ?? 0);
  const totalCost = Number(opp.estimatedCost ?? 0);
  const profit = totalSell - totalCost;
  const margin = totalSell > 0 ? profit / totalSell : 0;

  return (
    <main className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Kpi title="Bid Price" value={formatCurrency(totalSell)} hint="Sum of sell totals" />
        <Kpi title="Estimated Cost" value={formatCurrency(totalCost)} hint="Sum of cost totals" />
        <Kpi title="Margin" value={totalSell > 0 ? `${(margin * 100).toFixed(1)}%` : "-"} hint={`${formatCurrency(profit)} gross profit`} tone={margin < 0.08 ? "danger" : margin < 0.15 ? "warning" : "neutral"} />
      </section>

      <SectionCard
        title="Costing Table"
        description="Spreadsheet-style costing for materials, labour, subcontractors, preliminaries, overhead and contingency. Totals are recalculated on save."
      >
        {(opp.costItems ?? []).length === 0 ? (
          <EmptyState
            title="No cost items yet"
            description="Add the first line item below. Bid price and margin will update automatically."
          />
        ) : null}

        <div className="space-y-6">
          {CATEGORIES.map((cat) => {
            const items = byCat.get(cat) ?? [];
            const catCost = items.reduce((sum, r) => sum + Number(r.totalCost ?? 0), 0);
            const catSell = items.reduce((sum, r) => sum + Number(r.totalSell ?? 0), 0);

            return (
              <div key={cat} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-stone-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">{cat.replaceAll("_", " ")}</p>
                    <p className="text-xs text-neutral-500">{items.length} line(s)</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-700">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      Cost: {formatCurrency(catCost)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      Sell: {formatCurrency(catSell)}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-sm">
                    <thead className="bg-white text-neutral-700">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold">Description</th>
                        <th className="px-3 py-3 text-left font-semibold">Unit</th>
                        <th className="px-3 py-3 text-right font-semibold">Qty</th>
                        <th className="px-3 py-3 text-right font-semibold">Unit Cost</th>
                        <th className="px-3 py-3 text-right font-semibold">Unit Sell</th>
                        <th className="px-3 py-3 text-right font-semibold">Total Cost</th>
                        <th className="px-3 py-3 text-right font-semibold">Total Sell</th>
                        <th className="px-4 py-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {items.map((r) => (
                        <tr key={r.id} className="hover:bg-stone-50/60">
                          <td className="px-4 py-3">
                            <form action={upsertBidCostItemAction} className="flex items-center gap-2">
                              <input type="hidden" name="opportunityId" value={opp.id} />
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="category" value={cat} />
                              <input
                                name="description"
                                defaultValue={r.description}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                              />
                              <input type="hidden" name="sortOrder" value={String(r.sortOrder ?? 0)} />
                              <input type="hidden" name="notes" value={String(r.notes ?? "")} />
                              <button type="submit" className="sr-only">
                                Save
                              </button>
                            </form>
                          </td>
                          <td className="px-3 py-3">
                            <InlineUpdate oppId={opp.id} row={r} category={cat} field="unit" />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <InlineUpdate oppId={opp.id} row={r} category={cat} field="quantity" />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <InlineUpdate oppId={opp.id} row={r} category={cat} field="unitCost" />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <InlineUpdate oppId={opp.id} row={r} category={cat} field="unitSell" />
                          </td>
                          <td className="px-3 py-3 text-right text-neutral-700">{formatCurrency(Number(r.totalCost ?? 0))}</td>
                          <td className="px-3 py-3 text-right font-semibold text-neutral-950">{formatCurrency(Number(r.totalSell ?? 0))}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <form action={upsertBidCostItemAction}>
                                <input type="hidden" name="opportunityId" value={opp.id} />
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="category" value={cat} />
                                <input type="hidden" name="description" value={r.description} />
                                <input type="hidden" name="unit" value={r.unit ?? ""} />
                                <input type="hidden" name="quantity" value={String(Number(r.quantity ?? 0))} />
                                <input type="hidden" name="unitCost" value={String(Number(r.unitCost ?? 0))} />
                                <input type="hidden" name="unitSell" value={String(Number(r.unitSell ?? 0))} />
                                <input type="hidden" name="sortOrder" value={String(r.sortOrder ?? 0)} />
                                <input type="hidden" name="notes" value={String(r.notes ?? "")} />
                                <ActionButton type="submit" size="sm" variant="secondary">
                                  Recalc
                                </ActionButton>
                              </form>
                              <form action={deleteBidCostItemAction}>
                                <input type="hidden" name="opportunityId" value={opp.id} />
                                <input type="hidden" name="id" value={r.id} />
                                <ActionButton type="submit" size="sm" variant="danger">
                                  Remove
                                </ActionButton>
                              </form>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Add Cost Item" description="Add a new costing line under a category.">
        <form action={upsertBidCostItemAction} className="grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="opportunityId" value={opp.id} />
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-neutral-900">Category</label>
            <select name="category" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" defaultValue="MATERIAL">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-4">
            <label className="block text-sm font-semibold text-neutral-900">Description</label>
            <input name="description" required className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="e.g. Ceiling works / Wiring / Carpentry package" />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-sm font-semibold text-neutral-900">Unit</label>
            <input name="unit" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="lot" />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-sm font-semibold text-neutral-900">Qty</label>
            <input name="quantity" defaultValue="1" inputMode="decimal" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-right text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-neutral-900">Unit Cost</label>
            <input name="unitCost" defaultValue="0" inputMode="decimal" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-right text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-neutral-900">Unit Sell</label>
            <input name="unitSell" defaultValue="0" inputMode="decimal" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-right text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" />
          </div>
          <div className="sm:col-span-6 flex justify-end">
            <ActionButton type="submit">Add Line</ActionButton>
          </div>
        </form>
      </SectionCard>
    </main>
  );
}

function Kpi(props: { title: string; value: string; hint: string; tone?: "neutral" | "warning" | "danger" }) {
  const tone = props.tone ?? "neutral";
  const badge =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-white text-neutral-700";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
          <p className="mt-2 text-sm text-neutral-600">{props.hint}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge}`}>Live</span>
      </div>
    </div>
  );
}

function InlineUpdate(props: { oppId: string; row: any; category: string; field: "unit" | "quantity" | "unitCost" | "unitSell" }) {
  const value =
    props.field === "unit"
      ? String(props.row.unit ?? "")
      : String(Number(props.row[props.field] ?? 0));

  const isNumeric = props.field !== "unit";

  return (
    <form action={upsertBidCostItemAction}>
      <input type="hidden" name="opportunityId" value={props.oppId} />
      <input type="hidden" name="id" value={props.row.id} />
      <input type="hidden" name="category" value={props.category} />
      <input type="hidden" name="description" value={props.row.description} />
      <input type="hidden" name="sortOrder" value={String(props.row.sortOrder ?? 0)} />
      <input type="hidden" name="notes" value={String(props.row.notes ?? "")} />

      {/* carry over other fields */}
      {props.field !== "unit" ? <input type="hidden" name="unit" value={String(props.row.unit ?? "")} /> : null}
      {props.field !== "quantity" ? <input type="hidden" name="quantity" value={String(Number(props.row.quantity ?? 0))} /> : null}
      {props.field !== "unitCost" ? <input type="hidden" name="unitCost" value={String(Number(props.row.unitCost ?? 0))} /> : null}
      {props.field !== "unitSell" ? <input type="hidden" name="unitSell" value={String(Number(props.row.unitSell ?? 0))} /> : null}

      <input
        name={props.field}
        defaultValue={value}
        inputMode={isNumeric ? "decimal" : "text"}
        className={[
          "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200",
          isNumeric ? "text-right tabular-nums" : "",
        ].join(" ")}
      />
      <button type="submit" className="sr-only">
        Save
      </button>
    </form>
  );
}
