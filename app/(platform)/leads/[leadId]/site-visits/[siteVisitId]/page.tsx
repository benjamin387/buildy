import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getSiteVisitById } from "@/lib/site-visits/service";
import { SiteVisitStatusBadge } from "@/app/(platform)/leads/[leadId]/site-visits/components/site-visit-status-badge";
import {
  addMeasurementNoteAction,
  addSiteVisitAreaAction,
  createQuotationDraftFromSiteVisitAction,
  markSiteVisitStatusAction,
  saveBudgetAction,
  saveChecklistAction,
  saveTimelineAction,
  uploadSitePhotoAction,
} from "@/app/(platform)/leads/[leadId]/site-visits/actions";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

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

function toIsoDateValue(date: Date | null | undefined): string {
  if (!date) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type ChecklistItems = {
  scope?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
};

function asChecklistItems(items: unknown): ChecklistItems | null {
  if (!items || typeof items !== "object") return null;
  return items as ChecklistItems;
}

function checklistBool(items: ChecklistItems | null, group: keyof ChecklistItems, key: string): boolean {
  const g = items?.[group];
  if (!g || typeof g !== "object") return false;
  return Boolean((g as Record<string, unknown>)[key]);
}

function checklistText(items: ChecklistItems | null, group: keyof ChecklistItems, key: string): string {
  const g = items?.[group];
  if (!g || typeof g !== "object") return "";
  const value = (g as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function Card(props: { title: string; children: ReactNode; description?: string }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-neutral-950">{props.title}</h2>
        {props.description ? <p className="text-sm text-neutral-600">{props.description}</p> : null}
      </div>
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

function InfoRow(props: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</span>
      <span className="text-right text-sm text-neutral-900">{props.value}</span>
    </div>
  );
}

export default async function LeadSiteVisitDetailPage({
  params,
}: {
  params: Promise<{ leadId: string; siteVisitId: string }>;
}) {
  await requirePermission({ permission: Permission.PROJECT_READ });

  const { leadId, siteVisitId } = await params;
  const visit = await getSiteVisitById(siteVisitId);
  if (!visit || visit.leadId !== leadId) notFound();

  const areasById = new Map(visit.areas.map((a) => [a.id, a]));
  const checklistItems = asChecklistItems(visit.checklist?.items ?? null);

  const canCreateQuote = visit.status === "COMPLETED";

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
            <SiteVisitStatusBadge status={visit.status} />
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {visit.lead?.leadNumber ?? "LEAD"}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Site Visit
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            {visit.lead?.customerName ?? "Site Visit"}
          </h1>
          <p className="mt-2 text-sm text-neutral-600">{visit.addressSnapshot}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {visit.projectId ? (
            <Link
              href={`/projects/${visit.projectId}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Open Project
            </Link>
          ) : null}

          <form action={markSiteVisitStatusAction}>
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="siteVisitId" value={visit.id} />
            <div className="flex items-center gap-2">
              <select
                name="status"
                defaultValue={visit.status}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              >
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Update Status
              </button>
            </div>
          </form>

          {canCreateQuote ? (
            <form action={createQuotationDraftFromSiteVisitAction}>
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="siteVisitId" value={visit.id} />
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600">
                Create Quotation Draft
              </button>
            </form>
          ) : (
            <span className="text-sm text-neutral-500">
              Complete the visit to create a quotation draft.
            </span>
          )}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card title="Visit Snapshot">
          <div className="space-y-3">
            <InfoRow label="Scheduled" value={formatDateTime(visit.scheduledAt)} />
            <InfoRow label="Completed" value={formatDateTime(visit.completedAt)} />
            <InfoRow label="Status" value={<SiteVisitStatusBadge status={visit.status} />} />
          </div>
        </Card>
        <Card title="Assignment">
          <div className="space-y-3">
            <InfoRow label="Sales" value={visit.assignedSalesName ?? "-"} />
            <InfoRow label="Sales Email" value={visit.assignedSalesEmail ?? "-"} />
            <InfoRow label="Designer" value={visit.assignedDesignerName ?? "-"} />
            <InfoRow label="Designer Email" value={visit.assignedDesignerEmail ?? "-"} />
          </div>
        </Card>
        <Card title="Notes">
          <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">{visit.notes ?? "No notes."}</p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Areas / Rooms"
          description="Create areas like Kitchen, Living, Master Bedroom to organize measurements and photos."
        >
          <form action={addSiteVisitAreaAction} className="grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="siteVisitId" value={visit.id} />
            <label className="grid gap-2 text-sm sm:col-span-3">
              <span className="font-medium text-neutral-800">Area title</span>
              <input
                name="title"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Kitchen"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-3">
              <span className="font-medium text-neutral-800">Notes (optional)</span>
              <input
                name="notes"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Keep existing tiles"
              />
            </label>
            <div className="flex justify-end sm:col-span-6">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Add Area
              </button>
            </div>
          </form>

          <div className="mt-6 space-y-3">
            {visit.areas.length === 0 ? (
              <p className="text-sm text-neutral-600">No areas created yet.</p>
            ) : (
              visit.areas.map((area) => (
                <div key={area.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-neutral-950">{area.title}</p>
                  <p className="mt-1 text-sm text-neutral-600">{area.notes ?? "No notes."}</p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Measurements" description="Capture key dimensions for quotation take-off.">
          <form action={addMeasurementNoteAction} className="grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="siteVisitId" value={visit.id} />

            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Area</span>
              <select
                name="areaId"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                defaultValue=""
              >
                <option value="">(Unassigned)</option>
                {visit.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Title</span>
              <input
                name="title"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Wall length"
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-1">
              <span className="font-medium text-neutral-800">Value</span>
              <input
                name="value"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. 3.2"
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-1">
              <span className="font-medium text-neutral-800">Unit</span>
              <input
                name="unit"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="m / mm"
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-6">
              <span className="font-medium text-neutral-800">Notes (optional)</span>
              <input
                name="notes"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="Optional context"
              />
            </label>

            <div className="flex justify-end sm:col-span-6">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Add Measurement
              </button>
            </div>
          </form>

          <div className="mt-6 space-y-3">
            {visit.measurements.length === 0 ? (
              <p className="text-sm text-neutral-600">No measurements recorded yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-neutral-800">Area</th>
                      <th className="px-4 py-3 text-left font-semibold text-neutral-800">Measurement</th>
                      <th className="px-4 py-3 text-left font-semibold text-neutral-800">Value</th>
                      <th className="px-4 py-3 text-left font-semibold text-neutral-800">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visit.measurements.map((m) => (
                      <tr key={m.id} className="border-t border-neutral-200">
                        <td className="px-4 py-3 text-neutral-700">
                          {m.areaId ? areasById.get(m.areaId)?.title ?? "-" : "-"}
                        </td>
                        <td className="px-4 py-3 font-medium text-neutral-900">{m.title}</td>
                        <td className="px-4 py-3 text-neutral-700">
                          {m.value}
                          {m.unit ? ` ${m.unit}` : ""}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">{m.notes ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </section>

      <Card title="Photos" description="Upload reference photos. Max 10MB per image.">
        <form action={uploadSitePhotoAction} className="grid gap-3 sm:grid-cols-6" encType="multipart/form-data">
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="siteVisitId" value={visit.id} />

          <label className="grid gap-2 text-sm sm:col-span-2">
            <span className="font-medium text-neutral-800">Area</span>
            <select
              name="areaId"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              defaultValue=""
            >
              <option value="">(Unassigned)</option>
              {visit.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm sm:col-span-2">
            <span className="font-medium text-neutral-800">Caption (optional)</span>
            <input
              name="caption"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. Existing kitchen cabinets"
            />
          </label>

          <label className="grid gap-2 text-sm sm:col-span-2">
            <span className="font-medium text-neutral-800">Photo</span>
            <input
              type="file"
              name="photo"
              accept="image/png,image/jpeg,image/webp"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <div className="flex justify-end sm:col-span-6">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Upload Photo
            </button>
          </div>
        </form>

        <div className="mt-6">
          {visit.photos.length === 0 ? (
            <p className="text-sm text-neutral-600">No photos uploaded yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visit.photos.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.fileUrl} alt={p.caption ?? p.fileName ?? "Site photo"} className="h-40 w-full object-cover" />
                  <div className="space-y-1 px-4 py-3">
                    <p className="text-sm font-medium text-neutral-900">
                      {p.areaId ? areasById.get(p.areaId)?.title ?? "Unassigned" : "Unassigned"}
                    </p>
                    <p className="text-xs text-neutral-600">{p.caption ?? p.fileName ?? "-"}</p>
                    <p className="text-[11px] text-neutral-500">{formatDateTime(p.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Client Requirements" description="Capture scope preferences and constraints for quotation drafting.">
          <form action={saveChecklistAction} className="space-y-6">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="siteVisitId" value={visit.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <ChecklistBox title="Scope">
                <Checkbox name="scope_hacking" label="Hacking / Demolition" defaultChecked={checklistBool(checklistItems, "scope", "hacking")} />
                <Checkbox name="scope_masonry" label="Masonry / Wet works" defaultChecked={checklistBool(checklistItems, "scope", "masonry")} />
                <Checkbox name="scope_carpentry" label="Carpentry" defaultChecked={checklistBool(checklistItems, "scope", "carpentry")} />
                <Checkbox name="scope_electrical" label="Electrical" defaultChecked={checklistBool(checklistItems, "scope", "electrical")} />
                <Checkbox name="scope_plumbing" label="Plumbing" defaultChecked={checklistBool(checklistItems, "scope", "plumbing")} />
                <Checkbox name="scope_ceiling" label="Ceiling / Partition" defaultChecked={checklistBool(checklistItems, "scope", "ceiling")} />
                <Checkbox name="scope_flooring" label="Flooring" defaultChecked={checklistBool(checklistItems, "scope", "flooring")} />
                <Checkbox name="scope_painting" label="Painting" defaultChecked={checklistBool(checklistItems, "scope", "painting")} />
                <Checkbox name="scope_glass" label="Glass / Aluminium" defaultChecked={checklistBool(checklistItems, "scope", "glass")} />
                <Checkbox name="scope_cleaning" label="Cleaning / Disposal" defaultChecked={checklistBool(checklistItems, "scope", "cleaning")} />
                <Checkbox name="scope_aircon" label="Aircon" defaultChecked={checklistBool(checklistItems, "scope", "aircon")} />
                <label className="mt-3 grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Other scope (optional)</span>
                  <input
                    name="scope_other"
                    defaultValue={checklistText(checklistItems, "scope", "other")}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="Describe any other scope items"
                  />
                </label>
              </ChecklistBox>

              <ChecklistBox title="Constraints">
                <Checkbox name="con_management_approval" label="Management approval required" defaultChecked={checklistBool(checklistItems, "constraints", "managementApproval")} />
                <Checkbox name="con_pets" label="Pets at home" defaultChecked={checklistBool(checklistItems, "constraints", "petsAtHome")} />
                <label className="mt-3 grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Working hours</span>
                  <input
                    name="con_working_hours"
                    defaultValue={checklistText(checklistItems, "constraints", "workingHours")}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="e.g. 9am-5pm weekdays"
                  />
                </label>
                <label className="mt-3 grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Access restrictions</span>
                  <input
                    name="con_access"
                    defaultValue={checklistText(checklistItems, "constraints", "accessRestrictions")}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="e.g. lift booking, loading bay"
                  />
                </label>
                <label className="mt-3 grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Other constraints (optional)</span>
                  <input
                    name="con_other"
                    defaultValue={checklistText(checklistItems, "constraints", "other")}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="Any other constraints"
                  />
                </label>
              </ChecklistBox>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Preferences</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Design style</span>
                  <input
                    name="pref_design_style"
                    defaultValue={checklistText(checklistItems, "preferences", "designStyle")}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="e.g. Modern Scandinavian"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Color palette</span>
                  <input
                    name="pref_color_palette"
                    defaultValue={checklistText(checklistItems, "preferences", "colorPalette")}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="e.g. Warm neutrals"
                  />
                </label>
                <label className="grid gap-2 text-sm sm:col-span-2">
                  <span className="font-medium text-neutral-800">Special notes</span>
                  <textarea
                    name="pref_notes"
                    rows={3}
                    defaultValue={checklistText(checklistItems, "preferences", "specialNotes")}
                    className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="Any special preferences or must-haves"
                  />
                </label>
              </div>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Checklist notes (optional)</span>
              <textarea
                name="notes"
                rows={3}
                defaultValue={visit.checklist?.notes ?? ""}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                placeholder="General requirement notes"
              />
            </label>

            <div className="flex justify-end">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Save Requirements
              </button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card title="Budget Range" description="Capture budget expectations (optional).">
            <form action={saveBudgetAction} className="grid gap-4 sm:grid-cols-6">
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="siteVisitId" value={visit.id} />

              <label className="grid gap-2 text-sm sm:col-span-2">
                <span className="font-medium text-neutral-800">Min (SGD)</span>
                <input
                  name="minAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={visit.budgetRange?.minAmount ? Number(visit.budgetRange.minAmount) : ""}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm sm:col-span-2">
                <span className="font-medium text-neutral-800">Max (SGD)</span>
                <input
                  name="maxAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={visit.budgetRange?.maxAmount ? Number(visit.budgetRange.maxAmount) : ""}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm sm:col-span-2">
                <span className="font-medium text-neutral-800">Currency</span>
                <input
                  name="currency"
                  defaultValue={visit.budgetRange?.currency ?? "SGD"}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm sm:col-span-6">
                <span className="font-medium text-neutral-800">Notes (optional)</span>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={visit.budgetRange?.notes ?? ""}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <div className="flex justify-end sm:col-span-6">
                <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                  Save Budget
                </button>
              </div>
            </form>
          </Card>

          <Card title="Timeline Expectations" description="Capture desired start/completion dates (optional).">
            <form action={saveTimelineAction} className="grid gap-4 sm:grid-cols-6">
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="siteVisitId" value={visit.id} />

              <label className="grid gap-2 text-sm sm:col-span-3">
                <span className="font-medium text-neutral-800">Desired start</span>
                <input
                  type="date"
                  name="desiredStartDate"
                  defaultValue={toIsoDateValue(visit.timelineExpectation?.desiredStartDate)}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm sm:col-span-3">
                <span className="font-medium text-neutral-800">Desired completion</span>
                <input
                  type="date"
                  name="desiredCompletionDate"
                  defaultValue={toIsoDateValue(visit.timelineExpectation?.desiredCompletionDate)}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm sm:col-span-6">
                <span className="font-medium text-neutral-800">Notes (optional)</span>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={visit.timelineExpectation?.notes ?? ""}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <div className="flex justify-end sm:col-span-6">
                <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                  Save Timeline
                </button>
              </div>
            </form>
          </Card>
        </div>
      </section>
    </main>
  );
}

function ChecklistBox(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <div className="mt-3 space-y-2">{props.children}</div>
    </div>
  );
}

function Checkbox(props: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-800">
      <input
        type="checkbox"
        name={props.name}
        defaultChecked={props.defaultChecked}
        className="h-4 w-4 rounded border-neutral-300 text-neutral-950"
      />
      <span>{props.label}</span>
    </label>
  );
}
