import { PageHeader } from "@/app/components/ui/page-header";
import { BizsafeDashboardClient } from "@/app/(platform)/compliance/bizsafe/components/bizsafe-dashboard-client";
import type { BizsafeDashboardData } from "@/app/(platform)/compliance/bizsafe/components/types";
import { canEditBizsafeModule, requireBizsafeViewAccess } from "@/lib/bizsafe/access";
import { getBizsafeDashboardSnapshot } from "@/lib/bizsafe/service";

export const dynamic = "force-dynamic";

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export default async function BizsafePage() {
  const user = await requireBizsafeViewAccess();
  const snapshot = await getBizsafeDashboardSnapshot();

  const initialData: BizsafeDashboardData = {
    profile: {
      ...snapshot.profile,
      approvalDate: toIso(snapshot.profile.approvalDate),
      issueDate: toIso(snapshot.profile.issueDate),
      expiryDate: toIso(snapshot.profile.expiryDate),
      auditDate: toIso(snapshot.profile.auditDate),
      auditReportExpiryDate: toIso(snapshot.profile.auditReportExpiryDate),
      createdAt: snapshot.profile.createdAt.toISOString(),
      updatedAt: snapshot.profile.updatedAt.toISOString(),
    },
    documents: snapshot.documents.map((document) => ({
      ...document,
      uploadedAt: document.uploadedAt.toISOString(),
    })),
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      dueDate: toIso(task.dueDate),
      completedAt: toIso(task.completedAt),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    })),
    trainingRecords: snapshot.trainingRecords.map((record) => ({
      ...record,
      courseDate: toIso(record.courseDate),
      completionDate: toIso(record.completionDate),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    })),
  };

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Compliance"
        title="BizSAFE"
        subtitle="Track BizSAFE status, training, RM audit validity, certificate renewal timing, and tender readiness in one workspace."
      />

      <BizsafeDashboardClient initialData={initialData} canEdit={canEditBizsafeModule(user)} />
    </main>
  );
}

