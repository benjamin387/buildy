"use client";

import { BizsafeLevel } from "@prisma/client";
import { useTransition } from "react";
import Link from "next/link";
import { ActionButton } from "@/app/components/ui/action-button";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate, formatLevel } from "@/app/(platform)/compliance/bizsafe/components/helpers";
import type { BizsafeTrainingRecordDto } from "@/app/(platform)/compliance/bizsafe/components/types";

export type BizsafeTrainingCreatePayload = {
  courseName: string;
  courseLevel: BizsafeLevel | null;
  attendeeName: string;
  attendeeRole: string | null;
  providerName: string | null;
  courseDate: string | null;
  completionDate: string | null;
  certificateUrl: string | null;
  remarks: string | null;
};

export function BizsafeTrainingTable(props: {
  trainingRecords: BizsafeTrainingRecordDto[];
  canEdit: boolean;
  onCreateTraining: (payload: BizsafeTrainingCreatePayload) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    const rawLevel = String(formData.get("courseLevel") ?? "");
    const payload: BizsafeTrainingCreatePayload = {
      courseName: String(formData.get("courseName") ?? ""),
      courseLevel: rawLevel ? (rawLevel as BizsafeLevel) : null,
      attendeeName: String(formData.get("attendeeName") ?? ""),
      attendeeRole: toNullable(formData.get("attendeeRole")),
      providerName: toNullable(formData.get("providerName")),
      courseDate: toNullable(formData.get("courseDate")),
      completionDate: toNullable(formData.get("completionDate")),
      certificateUrl: toNullable(formData.get("certificateUrl")),
      remarks: toNullable(formData.get("remarks")),
    };

    startTransition(async () => {
      await props.onCreateTraining(payload);
    });
  }

  return (
    <SectionCard title="Training Records" description="Track leadership and RM training completion status.">
      <div className="space-y-4">
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-neutral-600">
                <th className="px-4 py-3 font-semibold">Course</th>
                <th className="px-4 py-3 font-semibold">Attendee</th>
                <th className="px-4 py-3 font-semibold">Provider</th>
                <th className="px-4 py-3 font-semibold">Completion</th>
                <th className="px-4 py-3 font-semibold">Certificate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {props.trainingRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    No training records captured yet.
                  </td>
                </tr>
              ) : (
                props.trainingRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-neutral-950">{record.courseName}</p>
                        {record.courseLevel ? (
                          <div className="mt-1">
                            <StatusPill tone="info">{formatLevel(record.courseLevel)}</StatusPill>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      <p>{record.attendeeName}</p>
                      <p className="text-xs text-neutral-500">{record.attendeeRole ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{record.providerName ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      <p>{formatDate(record.completionDate)}</p>
                      <p className="text-xs text-neutral-500">Course: {formatDate(record.courseDate)}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {record.certificateUrl ? (
                        <Link href={record.certificateUrl} target="_blank" className="font-semibold text-neutral-900 underline-offset-4 hover:underline">
                          Open
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {props.canEdit ? (
          <form action={handleCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
            <Field label="Course Name" name="courseName" required />
            <Field label="Attendee Name" name="attendeeName" required />
            <SelectField
              label="Course Level"
              name="courseLevel"
              defaultValue=""
              options={[
                { value: "", label: "Not specified" },
                ...Object.values(BizsafeLevel).map((level) => ({ value: level, label: formatLevel(level) })),
              ]}
            />
            <Field label="Attendee Role" name="attendeeRole" />
            <Field label="Provider Name" name="providerName" />
            <Field label="Course Date" name="courseDate" type="date" />
            <Field label="Completion Date" name="completionDate" type="date" />
            <Field label="Certificate URL" name="certificateUrl" type="url" />
            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Remarks</label>
              <textarea
                name="remarks"
                className="mt-2 h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div className="lg:col-span-2 flex justify-end">
              <ActionButton type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Add Training Record"}
              </ActionButton>
            </div>
          </form>
        ) : null}
      </div>
    </SectionCard>
  );
}

function toNullable(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function Field(props: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-900">{props.label}</label>
      <input
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
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
        className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      >
        {props.options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
