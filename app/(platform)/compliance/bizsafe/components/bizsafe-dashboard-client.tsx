"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { BizsafeDocumentType } from "@prisma/client";
import { getDaysToExpiry, getMissingBizsafeRequirements } from "@/lib/bizsafe/status";
import {
  BizsafeDocumentList,
  type BizsafeDocumentCreatePayload,
} from "@/app/(platform)/compliance/bizsafe/components/bizsafe-document-list";
import {
  BizsafeProfileForm,
  type BizsafeProfilePayload,
} from "@/app/(platform)/compliance/bizsafe/components/bizsafe-profile-form";
import { BizsafeReadinessScore } from "@/app/(platform)/compliance/bizsafe/components/bizsafe-readiness-score";
import { BizsafeRenewalCard } from "@/app/(platform)/compliance/bizsafe/components/bizsafe-renewal-card";
import { BizsafeStatusCard } from "@/app/(platform)/compliance/bizsafe/components/bizsafe-status-card";
import {
  BizsafeTaskList,
  type BizsafeTaskCreatePayload,
  type BizsafeTaskUpdatePayload,
} from "@/app/(platform)/compliance/bizsafe/components/bizsafe-task-list";
import {
  BizsafeTrainingTable,
  type BizsafeTrainingCreatePayload,
} from "@/app/(platform)/compliance/bizsafe/components/bizsafe-training-table";
import { formatDate } from "@/app/(platform)/compliance/bizsafe/components/helpers";
import type { BizsafeDashboardData } from "@/app/(platform)/compliance/bizsafe/components/types";

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Request failed");
  }

  return payload.data as T;
}

export function BizsafeDashboardClient(props: {
  initialData: BizsafeDashboardData;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<BizsafeDashboardData>(props.initialData);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refreshSoon() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function withFeedback<T>(work: () => Promise<T>, successMessage: string): Promise<T | null> {
    setError(null);
    try {
      const result = await work();
      setMessage(successMessage);
      refreshSoon();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      return null;
    }
  }

  async function saveProfile(payload: BizsafeProfilePayload) {
    const profile = await withFeedback(
      () => requestJson<BizsafeDashboardData["profile"]>("/api/bizsafe/profile", { method: "POST", body: JSON.stringify(payload) }),
      "BizSAFE profile updated.",
    );
    if (!profile) return;
    setData((current) => ({ ...current, profile }));
  }

  async function createDocument(payload: BizsafeDocumentCreatePayload) {
    const document = await withFeedback(
      () => requestJson<BizsafeDashboardData["documents"][number]>("/api/bizsafe/documents", { method: "POST", body: JSON.stringify(payload) }),
      "BizSAFE document added.",
    );
    if (!document) return;
    setData((current) => ({ ...current, documents: [document, ...current.documents] }));
  }

  async function createTask(payload: BizsafeTaskCreatePayload) {
    const task = await withFeedback(
      () => requestJson<BizsafeDashboardData["tasks"][number]>("/api/bizsafe/tasks", { method: "POST", body: JSON.stringify(payload) }),
      "BizSAFE action added.",
    );
    if (!task) return;
    setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
  }

  async function updateTask(taskId: string, payload: BizsafeTaskUpdatePayload) {
    const task = await withFeedback(
      () => requestJson<BizsafeDashboardData["tasks"][number]>(`/api/bizsafe/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) }),
      "BizSAFE action updated.",
    );
    if (!task) return;
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((existing) => (existing.id === task.id ? task : existing)),
    }));
  }

  async function deleteTask(taskId: string) {
    await withFeedback(
      () => requestJson<void>(`/api/bizsafe/tasks/${taskId}`, { method: "DELETE" }),
      "BizSAFE action removed.",
    );
    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
  }

  async function createTraining(payload: BizsafeTrainingCreatePayload) {
    const record = await withFeedback(
      () => requestJson<BizsafeDashboardData["trainingRecords"][number]>("/api/bizsafe/training", { method: "POST", body: JSON.stringify(payload) }),
      "Training record added.",
    );
    if (!record) return;
    setData((current) => ({ ...current, trainingRecords: [record, ...current.trainingRecords] }));
  }

  const missingRequirements = getMissingBizsafeRequirements(
    data.profile,
    data.documents,
    data.trainingRecords,
  );
  const hasAuditReportDocument = data.documents.some((document) => document.documentType === BizsafeDocumentType.RM_AUDIT_REPORT);
  const auditDays = getDaysToExpiry(data.profile.auditReportExpiryDate);

  return (
    <div className="space-y-6">
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {error}
        </div>
      ) : null}

      <BizsafeProfileForm profile={data.profile} canEdit={props.canEdit} onSubmit={saveProfile} />

      <section className="grid gap-6 xl:grid-cols-2">
        <BizsafeStatusCard profile={data.profile} documents={data.documents} />
        <BizsafeRenewalCard profile={data.profile} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <BizsafeTaskList
          tasks={data.tasks}
          missingRequirements={missingRequirements}
          canEdit={props.canEdit}
          onCreateTask={createTask}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
        />
        <SectionCard title="RM Audit" description="Audit ownership, report validity, and readiness dependency.">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <AuditMetric label="Auditor" value={data.profile.auditorName ?? "-"} />
              <AuditMetric label="Audit Company" value={data.profile.auditCompany ?? "-"} />
              <AuditMetric label="Audit Date" value={formatDate(data.profile.auditDate)} />
              <AuditMetric label="Report Expiry" value={formatDate(data.profile.auditReportExpiryDate)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={hasAuditReportDocument ? "success" : "warning"}>
                {hasAuditReportDocument ? "Audit Report Uploaded" : "Audit Report Missing"}
              </StatusPill>
              <StatusPill tone={auditDays !== null && auditDays <= 180 ? "warning" : "neutral"}>
                {auditDays === null ? "No Expiry Set" : `${auditDays} Day(s) Left`}
              </StatusPill>
            </div>
            <p className="text-sm text-neutral-600">
              Risk Management Audit Report validity is tracked for 3 years. Missing or expiring audit reports directly reduce tender readiness.
            </p>
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <BizsafeDocumentList documents={data.documents} canEdit={props.canEdit} onCreateDocument={createDocument} />
        <BizsafeReadinessScore
          profile={data.profile}
          documents={data.documents}
          tasks={data.tasks}
          trainingRecords={data.trainingRecords}
        />
      </section>

      <BizsafeTrainingTable
        trainingRecords={data.trainingRecords}
        canEdit={props.canEdit}
        onCreateTraining={createTraining}
      />
    </div>
  );
}

function AuditMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-2 text-sm font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}
