"use client";

import { BizsafeDocumentType } from "@prisma/client";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { getBizsafeCertificateStatus, getDaysToExpiry } from "@/lib/bizsafe/status";
import { formatApplicationStatus, formatCertificateStatus, formatDate, formatLevel, statusTone } from "@/app/(platform)/compliance/bizsafe/components/helpers";
import type { BizsafeDocumentDto, BizsafeProfileDto } from "@/app/(platform)/compliance/bizsafe/components/types";

function alertTone(kind: "warning" | "danger") {
  return kind === "danger"
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-amber-200 bg-amber-50 text-amber-900";
}

export function BizsafeStatusCard(props: {
  profile: BizsafeProfileDto;
  documents: BizsafeDocumentDto[];
}) {
  const certificateStatus = getBizsafeCertificateStatus(props.profile);
  const daysToExpiry = getDaysToExpiry(props.profile.expiryDate);
  const auditDays = getDaysToExpiry(props.profile.auditReportExpiryDate);
  const hasCertificateDocument = props.documents.some((document) => document.documentType === BizsafeDocumentType.CERTIFICATE);

  const alerts: Array<{ title: string; tone: "warning" | "danger" }> = [];
  if (daysToExpiry !== null && daysToExpiry <= 60) {
    alerts.push({
      title: daysToExpiry < 0 ? "Certificate has expired." : "Certificate expires within 60 days.",
      tone: daysToExpiry < 0 ? "danger" : "warning",
    });
  }
  if (auditDays !== null && auditDays <= 180) {
    alerts.push({
      title: auditDays < 0 ? "RM audit report has expired." : "RM audit report expires within 6 months.",
      tone: auditDays < 0 ? "danger" : "warning",
    });
  }
  if (!props.profile.rmChampionName?.trim()) {
    alerts.push({ title: "RM Champion has not been assigned.", tone: "warning" });
  }
  if (!props.profile.seniorManagementName?.trim()) {
    alerts.push({ title: "Senior management representative has not been assigned.", tone: "warning" });
  }
  if (!hasCertificateDocument) {
    alerts.push({ title: "No BizSAFE certificate document has been uploaded.", tone: "warning" });
  }

  return (
    <SectionCard title="BizSAFE Status" description="Current company standing, contacts, and immediate compliance alerts.">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={statusTone(certificateStatus)}>{formatCertificateStatus(certificateStatus)}</StatusPill>
          <StatusPill tone="info">{formatApplicationStatus(props.profile.status)}</StatusPill>
          <StatusPill tone="neutral">{formatLevel(props.profile.currentLevel)}</StatusPill>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Current Level" value={formatLevel(props.profile.currentLevel)} />
          <Metric label="Certificate Number" value={props.profile.certificateNumber ?? "-"} />
          <Metric label="Expiry Date" value={formatDate(props.profile.expiryDate)} />
          <Metric label="Days to Expiry" value={daysToExpiry === null ? "-" : String(daysToExpiry)} />
          <Metric label="Senior Management" value={props.profile.seniorManagementName ?? "-"} />
          <Metric label="RM Champion" value={props.profile.rmChampionName ?? "-"} />
          <Metric label="Auditor" value={props.profile.auditorName ?? "-"} />
          <Metric label="Audit Company" value={props.profile.auditCompany ?? "-"} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ContactBlock
            title="Senior Management Representative"
            name={props.profile.seniorManagementName}
            email={props.profile.seniorManagementEmail}
            phone={props.profile.seniorManagementPhone}
          />
          <ContactBlock
            title="RM Champion"
            name={props.profile.rmChampionName}
            email={props.profile.rmChampionEmail}
            phone={props.profile.rmChampionPhone}
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Expiry Alerts</p>
          {alerts.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              No active BizSAFE alerts right now.
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.title}
                className={`rounded-2xl border px-4 py-3 text-sm font-medium ${alertTone(alert.tone)}`}
              >
                {alert.title}
              </div>
            ))
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/70 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-2 text-sm font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}

function ContactBlock(props: {
  title: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-neutral-950">{props.title}</p>
      <div className="mt-3 space-y-1 text-sm text-neutral-600">
        <p>{props.name ?? "-"}</p>
        <p>{props.email ?? "-"}</p>
        <p>{props.phone ?? "-"}</p>
      </div>
    </div>
  );
}

