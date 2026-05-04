"use client";

import { BizsafeApplicationStatus, BizsafeLevel } from "@prisma/client";
import { useTransition } from "react";
import { ActionButton } from "@/app/components/ui/action-button";
import { SectionCard } from "@/app/components/ui/section-card";
import { formatDateInput, formatLevel } from "@/app/(platform)/compliance/bizsafe/components/helpers";
import type { BizsafeProfileDto } from "@/app/(platform)/compliance/bizsafe/components/types";

export type BizsafeProfilePayload = {
  companyName: string;
  uen: string | null;
  currentLevel: BizsafeLevel;
  certificateNumber: string | null;
  approvalDate: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  status: BizsafeApplicationStatus;
  seniorManagementName: string | null;
  seniorManagementEmail: string | null;
  seniorManagementPhone: string | null;
  rmChampionName: string | null;
  rmChampionEmail: string | null;
  rmChampionPhone: string | null;
  auditorName: string | null;
  auditCompany: string | null;
  auditDate: string | null;
  auditReportExpiryDate: string | null;
  remarks: string | null;
};

export function BizsafeProfileForm(props: {
  profile: BizsafeProfileDto;
  canEdit: boolean;
  onSubmit: (payload: BizsafeProfilePayload) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    const payload: BizsafeProfilePayload = {
      companyName: String(formData.get("companyName") ?? ""),
      uen: toNullable(formData.get("uen")),
      currentLevel: String(formData.get("currentLevel") ?? BizsafeLevel.NONE) as BizsafeLevel,
      certificateNumber: toNullable(formData.get("certificateNumber")),
      approvalDate: toNullable(formData.get("approvalDate")),
      issueDate: toNullable(formData.get("issueDate")),
      expiryDate: toNullable(formData.get("expiryDate")),
      status: String(formData.get("status") ?? BizsafeApplicationStatus.NOT_STARTED) as BizsafeApplicationStatus,
      seniorManagementName: toNullable(formData.get("seniorManagementName")),
      seniorManagementEmail: toNullable(formData.get("seniorManagementEmail")),
      seniorManagementPhone: toNullable(formData.get("seniorManagementPhone")),
      rmChampionName: toNullable(formData.get("rmChampionName")),
      rmChampionEmail: toNullable(formData.get("rmChampionEmail")),
      rmChampionPhone: toNullable(formData.get("rmChampionPhone")),
      auditorName: toNullable(formData.get("auditorName")),
      auditCompany: toNullable(formData.get("auditCompany")),
      auditDate: toNullable(formData.get("auditDate")),
      auditReportExpiryDate: toNullable(formData.get("auditReportExpiryDate")),
      remarks: toNullable(formData.get("remarks")),
    };

    startTransition(async () => {
      await props.onSubmit(payload);
    });
  }

  return (
    <SectionCard
      title="Profile & Application Progress"
      description="Maintain certificate metadata, application stage, key personnel, and RM audit details."
      actions={
        props.canEdit ? (
          <ActionButton type="submit" form="bizsafe-profile-form" disabled={isPending}>
            {isPending ? "Saving..." : "Save Profile"}
          </ActionButton>
        ) : undefined
      }
    >
      <form
        id="bizsafe-profile-form"
        action={handleSubmit}
        className="grid gap-4 lg:grid-cols-2"
      >
        <fieldset disabled={!props.canEdit || isPending} className="contents disabled:opacity-100">
          <Field label="Company Name" name="companyName" defaultValue={props.profile.companyName} required />
          <Field label="UEN" name="uen" defaultValue={props.profile.uen ?? ""} />

          <SelectField
            label="Current BizSAFE Level"
            name="currentLevel"
            defaultValue={props.profile.currentLevel}
            options={Object.values(BizsafeLevel).map((level) => ({ value: level, label: formatLevel(level) }))}
          />
          <SelectField
            label="Application Status"
            name="status"
            defaultValue={props.profile.status}
            options={Object.values(BizsafeApplicationStatus).map((status) => ({
              value: status,
              label: status.replaceAll("_", " "),
            }))}
          />

          <Field label="Certificate Number" name="certificateNumber" defaultValue={props.profile.certificateNumber ?? ""} />
          <Field label="Approval Date" name="approvalDate" type="date" defaultValue={formatDateInput(props.profile.approvalDate)} />
          <Field label="Issue Date" name="issueDate" type="date" defaultValue={formatDateInput(props.profile.issueDate)} />
          <Field label="Expiry Date" name="expiryDate" type="date" defaultValue={formatDateInput(props.profile.expiryDate)} />

          <Field label="Senior Management Name" name="seniorManagementName" defaultValue={props.profile.seniorManagementName ?? ""} />
          <Field label="Senior Management Email" name="seniorManagementEmail" type="email" defaultValue={props.profile.seniorManagementEmail ?? ""} />
          <Field label="Senior Management Phone" name="seniorManagementPhone" defaultValue={props.profile.seniorManagementPhone ?? ""} />
          <Field label="RM Champion Name" name="rmChampionName" defaultValue={props.profile.rmChampionName ?? ""} />
          <Field label="RM Champion Email" name="rmChampionEmail" type="email" defaultValue={props.profile.rmChampionEmail ?? ""} />
          <Field label="RM Champion Phone" name="rmChampionPhone" defaultValue={props.profile.rmChampionPhone ?? ""} />

          <Field label="Auditor Name" name="auditorName" defaultValue={props.profile.auditorName ?? ""} />
          <Field label="Audit Company" name="auditCompany" defaultValue={props.profile.auditCompany ?? ""} />
          <Field label="Audit Date" name="auditDate" type="date" defaultValue={formatDateInput(props.profile.auditDate)} />
          <Field
            label="RM Audit Report Expiry"
            name="auditReportExpiryDate"
            type="date"
            defaultValue={formatDateInput(props.profile.auditReportExpiryDate)}
          />

          <div className="lg:col-span-2">
            <label className="block text-sm font-semibold text-neutral-900">Remarks</label>
            <textarea
              name="remarks"
              defaultValue={props.profile.remarks ?? ""}
              className="mt-2 h-28 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              placeholder="Audit notes, application blockers, tender-specific compliance instructions..."
            />
          </div>
        </fieldset>
      </form>
      {!props.canEdit ? (
        <p className="mt-4 text-sm text-neutral-500">This profile is view-only for your role.</p>
      ) : null}
    </SectionCard>
  );
}

function toNullable(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function Field(props: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-900">
        {props.label}
        {props.required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        required={props.required}
        className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}

function SelectField(props: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-900">{props.label}</label>
      <select
        name={props.name}
        defaultValue={props.defaultValue}
        className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
