import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createLeadAction } from "@/app/(platform)/leads/actions";
import { LeadFormFields } from "@/app/(platform)/leads/components/lead-form-fields";
import { requireLeadSubmissionAccess } from "@/lib/leads/access";

export default async function NewLeadPage() {
  const user = await requireUser();
  requireLeadSubmissionAccess(user);

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Sales Pipeline
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            New Lead
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Capture customer and property details, then convert into a project when qualified.
          </p>
        </div>

        <Link
          href="/leads"
          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Back
        </Link>
      </div>

      <form action={createLeadAction} className="grid gap-6">
        <LeadFormFields showStatus={false} />
        <div className="flex items-center justify-end">
          <button className="inline-flex h-12 items-center justify-center rounded-xl bg-neutral-950 px-6 text-sm font-semibold text-white transition hover:bg-neutral-800">
            Create Lead
          </button>
        </div>
      </form>
    </main>
  );
}
