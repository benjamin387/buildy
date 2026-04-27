import Link from "next/link";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { createProjectAction } from "@/app/(platform)/projects/actions";
import { ProjectFormFields } from "@/app/(platform)/projects/components/project-form-fields";

export default async function NewProjectPage() {
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Project Core
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            New Project
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Create the project record and commercial snapshot. Milestones, tasks,
            and progress logs attach to this project.
          </p>
        </div>

        <Link
          href="/projects"
          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Back
        </Link>
      </div>

      <form action={createProjectAction} className="grid gap-6">
        <ProjectFormFields />

        <div className="flex items-center justify-end">
          <button className="inline-flex h-12 items-center justify-center rounded-xl bg-neutral-950 px-6 text-sm font-semibold text-white transition hover:bg-neutral-800">
            Create Project
          </button>
        </div>
      </form>
    </main>
  );
}
