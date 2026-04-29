"use client";

import { BizsafeDocumentType } from "@prisma/client";
import { useTransition } from "react";
import Link from "next/link";
import { ActionButton } from "@/app/components/ui/action-button";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate, formatDocumentType } from "@/app/(platform)/compliance/bizsafe/components/helpers";
import type { BizsafeDocumentDto } from "@/app/(platform)/compliance/bizsafe/components/types";

export type BizsafeDocumentCreatePayload = {
  documentType: BizsafeDocumentType;
  title: string;
  fileUrl: string | null;
  fileName: string | null;
  remarks: string | null;
};

export function BizsafeDocumentList(props: {
  documents: BizsafeDocumentDto[];
  canEdit: boolean;
  onCreateDocument: (payload: BizsafeDocumentCreatePayload) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    const payload: BizsafeDocumentCreatePayload = {
      documentType: String(formData.get("documentType") ?? BizsafeDocumentType.OTHER) as BizsafeDocumentType,
      title: String(formData.get("title") ?? ""),
      fileUrl: toNullable(formData.get("fileUrl")),
      fileName: toNullable(formData.get("fileName")),
      remarks: toNullable(formData.get("remarks")),
    };

    startTransition(async () => {
      await props.onCreateDocument(payload);
    });
  }

  return (
    <SectionCard title="Documents" description="Certificate, RM audit, application pack, and support metadata.">
      <div className="space-y-4">
        <div className="space-y-3">
          {props.documents.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-neutral-600">
              No BizSAFE documents uploaded yet.
            </div>
          ) : (
            props.documents.map((document) => (
              <div key={document.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-neutral-950">{document.title}</p>
                      <StatusPill tone="neutral">{formatDocumentType(document.documentType)}</StatusPill>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">
                      Uploaded {formatDate(document.uploadedAt)} · By {document.uploadedBy ?? "-"}
                    </p>
                    {document.remarks ? <p className="mt-2 text-sm text-neutral-600">{document.remarks}</p> : null}
                  </div>
                  {document.fileUrl ? (
                    <Link
                      href={document.fileUrl}
                      target="_blank"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
                    >
                      Open File
                    </Link>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {props.canEdit ? (
          <form action={handleCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
            <Field label="Title" name="title" required />
            <SelectField
              label="Document Type"
              name="documentType"
              defaultValue={BizsafeDocumentType.CERTIFICATE}
              options={Object.values(BizsafeDocumentType).map((documentType) => ({
                value: documentType,
                label: formatDocumentType(documentType),
              }))}
            />
            <Field label="File URL" name="fileUrl" type="url" />
            <Field label="File Name" name="fileName" />
            <div className="lg:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Remarks</label>
              <textarea
                name="remarks"
                className="mt-2 h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div className="lg:col-span-2 flex justify-end">
              <ActionButton type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Add Document"}
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
