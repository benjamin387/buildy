import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects/service";
import { updateProjectAction } from "@/app/(platform)/projects/actions";
import { ProjectFormFields } from "@/app/(platform)/projects/components/project-form-fields";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const project = await getProjectById(projectId);
  if (!project) notFound();

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Project Core
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            Edit Project
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Update project details, commercial snapshot, and key dates. Changes
            are recorded in the audit log and revision history.
          </p>
        </div>

        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Back
        </Link>
      </div>

      <form action={updateProjectAction} className="grid gap-6">
        <input type="hidden" name="projectId" value={projectId} />

        <ProjectFormFields
          includeActualCompletionDate
          defaults={{
            projectCode: project.projectCode,
            status: project.status,
            name: project.name,
            projectType: project.projectType,
            clientName: project.clientName,
            clientCompany: project.clientCompany,
            clientEmail: project.clientEmail,
            clientPhone: project.clientPhone,
            siteAddress: project.siteAddress,
            postalCode: project.postalCode,
            propertyType: project.propertyType,
            unitSizeSqft: project.unitSizeSqft ? Number(project.unitSizeSqft) : 0,
            contractValue: Number(project.contractValue),
            revisedContractValue: Number(project.revisedContractValue),
            estimatedCost: Number(project.estimatedCost),
            committedCost: Number(project.committedCost),
            actualCost: Number(project.actualCost),
            startDate: project.startDate,
            targetCompletionDate: project.targetCompletionDate,
            actualCompletionDate: project.actualCompletionDate,
            notes: project.notes,
          }}
        />

        <div className="flex items-center justify-end">
          <button className="inline-flex h-12 items-center justify-center rounded-xl bg-neutral-950 px-6 text-sm font-semibold text-white transition hover:bg-neutral-800">
            Save Changes
          </button>
        </div>
      </form>
    </main>
  );
}

