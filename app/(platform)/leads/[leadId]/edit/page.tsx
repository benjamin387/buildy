import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { requireLeadsModuleAccess } from "@/lib/leads/access";
import { getLeadByIdForViewer } from "@/lib/leads/service";
import { updateLeadAction } from "@/app/(platform)/leads/actions";
import { LeadFormFields } from "@/app/(platform)/leads/components/lead-form-fields";

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const session = await requireAuthenticatedSession();
  requireLeadsModuleAccess(session.user);

  const { leadId } = await params;
  const lead = await getLeadByIdForViewer({ viewer: session.user, leadId });
  if (!lead) notFound();

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Sales Pipeline
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            Edit Lead
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Update lead details and follow-up plan.
          </p>
        </div>

        <Link
          href={`/leads/${leadId}`}
          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Back
        </Link>
      </div>

      <form action={updateLeadAction} className="grid gap-6">
        <input type="hidden" name="leadId" value={leadId} />
        <LeadFormFields
          defaults={{
            leadNumber: lead.leadNumber,
            customerName: lead.customerName,
            customerEmail: lead.customerEmail,
            customerPhone: lead.customerPhone,
            marketingSource: lead.marketingSource,
            status: lead.status,
            assignedSalesName: lead.assignedSalesName,
            assignedSalesEmail: lead.assignedSalesEmail,
            projectAddress: lead.projectAddress,
            projectType: lead.projectType,
            propertyType: lead.propertyType,
            propertyAddress: lead.propertyAddress,
            estimatedBudget: lead.estimatedBudget ? Number(lead.estimatedBudget) : null,
            preferredStartDate: lead.preferredStartDate,
            remarks: lead.remarks,
            propertyCategory: lead.propertyCategory,
            residentialPropertyType: lead.residentialPropertyType,
            hdbType: lead.hdbType,
            condoType: lead.condoType,
            landedType: lead.landedType,
            preferredDesignStyle: lead.preferredDesignStyle,
            requirementSummary: lead.requirementSummary,
            notes: lead.notes,
            nextFollowUpAt: lead.nextFollowUpAt,
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
