import Link from "next/link";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/server/safe-query";
import { getOrCreateCompanyComplianceProfile } from "@/lib/bidding/compliance-service";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { StatusPill } from "@/app/components/ui/status-pill";
import { saveCompanyComplianceProfileAction } from "@/app/(platform)/settings/company-compliance/actions";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export default async function CompanyComplianceSettingsPage() {
  await requirePermission({ permission: Permission.SETTINGS_READ });
  await requireUser();

  const profile = await safeQuery(() => getOrCreateCompanyComplianceProfile(), null as any);
  const docs = await safeQuery(
    () =>
      prisma.complianceDocument.count({
        where: { status: "ACTIVE" },
      }),
    0,
  );

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Settings</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">Company Compliance Profile</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Maintain compliance details used by the tender submission pack generator. This does not auto-submit to GeBIZ.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="neutral">{docs} active document(s)</StatusPill>
          <Link
            href="/settings/document-library"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
          >
            Open Document Library
          </Link>
        </div>
      </div>

      <SectionCard title="Compliance Profile" description="Populate registration and compliance status for tender-generated documents.">
        <form action={saveCompanyComplianceProfileAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Company Name" name="companyName" defaultValue={profile?.companyName ?? "Buildy Pte Ltd"} required />
          <Field label="Legal Name" name="legalName" defaultValue={profile?.legalName ?? ""} placeholder="Optional" />
          <Field label="UEN" name="uen" defaultValue={profile?.uen ?? ""} placeholder="Optional" />

          <div className="sm:col-span-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-stone-50 px-4 py-3">
            <input type="checkbox" name="gstRegistered" defaultChecked={Boolean(profile?.gstRegistered ?? true)} />
            <div>
              <p className="text-sm font-semibold text-neutral-950">GST Registered</p>
              <p className="text-xs text-neutral-600">Enable if company is registered for Singapore GST.</p>
            </div>
          </div>

          <Field label="GST Number" name="gstNumber" defaultValue={profile?.gstNumber ?? ""} placeholder="Optional" />

          <Field label="BCA Registration" name="bcaRegistration" defaultValue={profile?.bcaRegistration ?? ""} placeholder="e.g. GB1 / CR06" />
          <Field label="BCA Expiry Date" name="bcaExpiryDate" defaultValue={profile?.bcaExpiryDate ? formatDate(profile.bcaExpiryDate) : ""} placeholder="YYYY-MM-DD" />

          <Field label="BizSAFE Status" name="bizsafeStatus" defaultValue={profile?.bizsafeStatus ?? ""} placeholder="e.g. BizSAFE Level 3" />
          <Field label="BizSAFE Expiry Date" name="bizsafeExpiryDate" defaultValue={profile?.bizsafeExpiryDate ? formatDate(profile.bizsafeExpiryDate) : ""} placeholder="YYYY-MM-DD" />

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-neutral-900">Notes</label>
            <textarea
              name="notes"
              defaultValue={profile?.notes ?? ""}
              className="mt-2 h-28 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              placeholder="Any compliance notes, validation constraints, tender-specific considerations..."
            />
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <ActionButton type="submit">Save Profile</ActionButton>
          </div>
        </form>
      </SectionCard>
    </main>
  );
}

function Field(props: { label: string; name: string; defaultValue?: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-900">
        {props.label}
        {props.required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      <input
        name={props.name}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        required={props.required}
        className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}

