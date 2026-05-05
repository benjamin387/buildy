"use client";

import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { getDaysToExpiry, getRenewalDueDate } from "@/lib/bizsafe/status";
import { formatDate } from "@/app/(platform)/compliance/bizsafe/components/helpers";
import type { BizsafeProfileDto } from "@/app/(platform)/compliance/bizsafe/components/types";

export function BizsafeRenewalCard(props: { profile: BizsafeProfileDto }) {
  const daysToExpiry = getDaysToExpiry(props.profile.expiryDate);
  const renewalDueDate = getRenewalDueDate(props.profile.expiryDate);
  const auditDays = getDaysToExpiry(props.profile.auditReportExpiryDate);

  return (
    <SectionCard title="Renewal Timeline" description="Track certificate expiry and the 2-month renewal window.">
      <div className="space-y-4">
        <TimelineRow
          label="Approval Date"
          value={formatDate(props.profile.approvalDate)}
          note="Level 3 validity is treated as 3 years from approval when expiry is not set."
        />
        <TimelineRow label="Issue Date" value={formatDate(props.profile.issueDate)} />
        <TimelineRow
          label="Certificate Expiry"
          value={formatDate(props.profile.expiryDate)}
          note={daysToExpiry === null ? "No expiry captured yet." : `${daysToExpiry} day(s) remaining.`}
        />
        <TimelineRow
          label="Renewal Due Date"
          value={formatDate(renewalDueDate)}
          note="Reminder window starts 2 months before expiry."
        />
        <TimelineRow
          label="RM Audit Report Expiry"
          value={formatDate(props.profile.auditReportExpiryDate)}
          note={auditDays === null ? "No audit report expiry captured yet." : `${auditDays} day(s) remaining.`}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Notice
            tone={daysToExpiry !== null && daysToExpiry <= 60 ? "warning" : "neutral"}
            title="Certificate Renewal"
            body={
              daysToExpiry === null
                ? "Capture the expiry date to activate the renewal timer."
                : daysToExpiry < 0
                  ? "Certificate is expired and should be renewed before any tender submission."
                  : daysToExpiry <= 60
                    ? "Renewal window is open now."
                    : "Certificate is currently outside the renewal window."
            }
          />
          <Notice
            tone={auditDays !== null && auditDays <= 180 ? "warning" : "neutral"}
            title="RM Audit"
            body={
              auditDays === null
                ? "Capture the RM audit report date or expiry date."
                : auditDays < 0
                  ? "Audit report has expired and readiness is reduced."
                  : auditDays <= 180
                    ? "Audit report should be refreshed within the next 6 months."
                    : "Audit report validity is healthy."
            }
          />
        </div>
      </div>
    </SectionCard>
  );
}

function TimelineRow(props: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-950">{props.label}</p>
        <StatusPill tone="neutral">{props.value}</StatusPill>
      </div>
      {props.note ? <p className="mt-2 text-sm text-neutral-600">{props.note}</p> : null}
    </div>
  );
}

function Notice(props: { tone: "warning" | "neutral"; title: string; body: string }) {
  return (
    <div
      className={
        props.tone === "warning"
          ? "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
          : "rounded-md border border-slate-200 bg-slate-50 px-4 py-3"
      }
    >
      <p className="text-sm font-semibold text-neutral-950">{props.title}</p>
      <p className="mt-2 text-sm text-neutral-600">{props.body}</p>
    </div>
  );
}

