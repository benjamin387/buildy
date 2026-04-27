import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPresentationStatus, Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getCompanyBranding } from "@/lib/branding";
import { ProposalPresentation, type ProposalPresentationData } from "@/app/components/proposal/proposal-presentation";
import { generatePresentationNarrativeAction, upsertPresentationAction } from "@/app/(platform)/projects/[projectId]/design-brief/actions";
import { ClientDeliveryActions } from "@/app/(platform)/components/client-delivery-actions";
import { MessagingPanel } from "@/app/(platform)/components/messaging-panel";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";

function isoDate(value: Date | null | undefined): string {
  if (!value) return "";
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function PresentationBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; briefId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, briefId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const branding = await getCompanyBranding();

  const brief = await prisma.designBrief.findUnique({
    where: { id: briefId },
    include: {
      project: { include: { client: true } },
      areas: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          layoutPlans: { orderBy: [{ createdAt: "desc" }], take: 2 },
          visualRenders: { orderBy: [{ createdAt: "desc" }], take: 3 },
          ffeProposals: { orderBy: [{ createdAt: "desc" }], take: 100 },
          qsBoqDraftItems: { orderBy: [{ sortOrder: "asc" }], take: 2000 },
        },
      },
      presentation: true,
    },
  });

  if (!brief || brief.projectId !== projectId) notFound();

  const presentation = brief.presentation;
  const defaultTitle = presentation?.title ?? `${brief.project?.name ?? "Project"} Presentation`;
  const defaultAddressedTo = presentation?.addressedTo ?? (brief.project?.client?.name ?? "Client");
  const sp = await searchParams;
  const deliveryToken = typeof sp.deliveryToken === "string" ? sp.deliveryToken : null;

  const projectName = brief.project?.name ?? "Project";
  const projectAddress = brief.project?.siteAddress || brief.project?.addressLine1 || "-";

  const preliminaryBuild = brief.areas.reduce(
    (sum, a) => sum + a.qsBoqDraftItems.reduce((s2, i) => s2 + Number(i.sellingTotal), 0),
    0,
  );
  const ffeAllowance = brief.areas.reduce(
    (sum, a) => sum + a.ffeProposals.reduce((s2, p) => s2 + Number(p.unitPrice) * Number(p.quantity), 0),
    0,
  );

  const areas = brief.areas.map((a) => {
    const visual = a.visualRenders[0];
    const imageUrl = (visual?.generatedImageUrl || visual?.fileUrl || "").trim();
    const visuals = imageUrl ? [{ url: imageUrl, caption: visual?.title ?? null }] : [];
    return {
      id: a.id,
      name: a.name,
      roomType: String(a.roomType),
      clientRequirement: a.clientRequirement ?? null,
      proposedTheme: a.proposedTheme ?? null,
      proposedLayoutNotes: a.proposedLayoutNotes ?? null,
      proposedMaterials: a.proposedMaterials ?? null,
      layoutTitle: a.layoutPlans[0]?.title ?? null,
      visuals,
    };
  });

  const ffeItems = brief.areas.flatMap((a) =>
    a.ffeProposals.map((p) => ({
      areaName: a.name,
      title: p.title,
      description: p.description ?? null,
      supplierName: p.supplierName ?? null,
      purchaseUrl: p.purchaseUrl ?? null,
      unitPrice: Number(p.unitPrice),
      quantity: Number(p.quantity),
      leadTimeDays: p.leadTimeDays ?? null,
      availabilityStatus: p.availabilityStatus ?? null,
      remarks: p.remarks ?? null,
    })),
  );

  const boqRows = brief.areas.map((a) => ({
    id: a.id,
    name: a.name,
    roomType: String(a.roomType),
    sellingTotal: a.qsBoqDraftItems.reduce((s, i) => s + Number(i.sellingTotal), 0),
  }));

  const heroImageUrl =
    areas
      .flatMap((a) => a.visuals)
      .map((v) => v.url)
      .find((u) => Boolean(u && u.trim())) ?? null;

  const previewData: ProposalPresentationData = {
    branding,
    title: defaultTitle,
    subtitle: `Design presentation · ${String(brief.propertyType)} · ${String(brief.designStyle ?? "STYLE")}`,
    addressedTo: defaultAddressedTo,
    projectName,
    projectAddress,
    dateLabel: presentation?.presentationDate ? formatLongDate(presentation.presentationDate) : formatLongDate(new Date()),
    heroImageUrl,
    designConceptText: presentation?.introductionText ?? brief.clientNeeds,
    roomNarrativeText: presentation?.roomNarrativeText ?? null,
    materialExplanationText: presentation?.materialExplanationText ?? null,
    budgetExplanationText: presentation?.budgetExplanationText ?? null,
    whyChooseUsText: presentation?.whyChooseUsText ?? null,
    upsellPitchText: presentation?.upsellPitchText ?? null,
    nextStepsText: presentation?.nextStepsText ?? null,
    areas,
    ffeItems,
    boqRows,
    preliminaryBuild,
    ffeAllowance,
    quotationTotal: null,
    includeWhyChooseUs: true,
  };

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/design-brief/${briefId}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Admin / Presentation
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            Client Presentation
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            PDF-ready content that pulls from drafter, 3D, FF&amp;E, and QS inputs.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/projects/${projectId}/design-brief/${briefId}/presentation/print`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Print View
          </Link>
        </div>
      </div>

      <ClientDeliveryActions
        returnTo={`/projects/${projectId}/design-brief/${briefId}/presentation`}
        projectId={projectId}
        documentType="DESIGN_PRESENTATION"
        documentId={briefId}
        deliveryToken={deliveryToken}
      />

      <MessagingPanel
        returnTo={`/projects/${projectId}/design-brief/${briefId}/presentation`}
        projectId={projectId}
        relatedType="DESIGN_PRESENTATION"
        relatedId={briefId}
        documentType="DESIGN_PRESENTATION"
        documentId={briefId}
        defaultRecipientName={brief.project?.client?.name ?? brief.project?.clientName ?? null}
        defaultRecipientEmail={brief.project?.client?.email ?? brief.project?.clientEmail ?? null}
        defaultRecipientPhone={brief.project?.client?.phone ?? brief.project?.clientPhone ?? null}
        defaultSubject={`Design presentation - ${brief.project?.name ?? "Project"}`}
        defaultBody={`Dear ${brief.project?.client?.name ?? brief.project?.clientName ?? "Client"},\n\nPlease find our design presentation for ${brief.project?.name ?? "your project"}.\n\nThank you.`}
        defaultChannel="EMAIL"
      />

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Presentation Deck Builder</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Use “Generate AI Narrative” to draft client-ready proposal text from the design brief.
            </p>
          </div>
          <form action={generatePresentationNarrativeAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="briefId" value={briefId} />
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="overwrite" className="h-4 w-4 rounded border-neutral-300" />
              Overwrite existing text
            </label>
            <PendingSubmitButton pendingText="Generating...">Generate AI Narrative</PendingSubmitButton>
          </form>
        </div>
        <form action={upsertPresentationAction} className="mt-5 grid gap-5 lg:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="briefId" value={briefId} />

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Title</span>
            <input
              name="title"
              required
              defaultValue={defaultTitle}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Addressed To</span>
            <input
              name="addressedTo"
              required
              defaultValue={defaultAddressedTo}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Presentation Date</span>
            <input
              type="date"
              name="presentationDate"
              defaultValue={isoDate(presentation?.presentationDate)}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Introduction</span>
            <textarea
              name="introductionText"
              rows={4}
              defaultValue={presentation?.introductionText ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Project intro, client pain points, high-level objectives."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Room-by-Room Narrative</span>
            <textarea
              name="roomNarrativeText"
              rows={6}
              defaultValue={presentation?.roomNarrativeText ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Client-ready room-by-room proposal narrative."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Materials Explanation</span>
            <textarea
              name="materialExplanationText"
              rows={5}
              defaultValue={presentation?.materialExplanationText ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Material palette explanation and durability/maintenance notes."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Budget Explanation</span>
            <textarea
              name="budgetExplanationText"
              rows={5}
              defaultValue={presentation?.budgetExplanationText ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Client-facing budget explanation (what is included, what can change)."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Upsell / Optional Upgrades Pitch</span>
            <textarea
              name="upsellPitchText"
              rows={4}
              defaultValue={presentation?.upsellPitchText ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Optional upgrades and client pitch (no internal cost)."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Team Introduction</span>
            <textarea
              name="teamIntroduction"
              rows={4}
              defaultValue={presentation?.teamIntroduction ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Drafter, 3D, FF&E, QS, PM/Admin."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Company Portfolio</span>
            <textarea
              name="companyPortfolioText"
              rows={4}
              defaultValue={presentation?.companyPortfolioText ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Reference work, credentials, track record."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Why Choose Us</span>
            <textarea
              name="whyChooseUsText"
              rows={4}
              defaultValue={presentation?.whyChooseUsText ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Differentiators, warranty, quality controls, timeline management."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Next Steps</span>
            <textarea
              name="nextStepsText"
              rows={4}
              defaultValue={presentation?.nextStepsText ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Client-friendly next steps to proceed."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Deck File URL (optional)</span>
            <input
              name="fileUrl"
              defaultValue={presentation?.fileUrl ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="https://... or /uploads/..."
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Status</span>
            <select
              name="status"
              defaultValue={presentation?.status ?? ClientPresentationStatus.DRAFT}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              {Object.values(ClientPresentationStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <div className="flex justify-end lg:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Save Presentation
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Pulled Content Preview</h2>
          <p className="mt-1 text-sm text-neutral-600">
            High-level summary of area-by-area inputs (layout, 3D, FF&amp;E, QS).
          </p>
        </div>
        <div className="divide-y divide-neutral-200">
          {brief.areas.map((a) => (
            <div key={a.id} className="px-6 py-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-950">{a.name}</p>
                  <p className="mt-1 text-sm text-neutral-600">{a.clientRequirement ?? "-"}</p>
                </div>
                <Link
                  href={`/projects/${projectId}/design-brief/${briefId}/areas/${a.id}`}
                  className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                >
                  Open Area
                </Link>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Layout</p>
                  <p className="mt-2 text-sm text-neutral-700">
                    {a.layoutPlans[0]?.title ?? "No layout plan yet."}
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">3D</p>
                  <p className="mt-2 text-sm text-neutral-700">
                    {a.visualRenders[0]?.title ?? "No renders yet."}
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">FF&amp;E</p>
                  <p className="mt-2 text-sm text-neutral-700">
                    {a.ffeProposals.length} items
                  </p>
                </div>
              </div>
            </div>
          ))}
          {brief.areas.length === 0 ? (
            <div className="px-6 py-6 text-sm text-neutral-600">No areas yet.</div>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Client preview</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">Luxury proposal preview</h2>
            <p className="mt-2 text-sm leading-7 text-neutral-600">
              This preview uses the same layout as print/PDF and public document links.
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/design-brief/${briefId}/presentation/print`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Open print/PDF →
          </Link>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-stone-50 p-4 sm:p-6">
          <ProposalPresentation data={previewData} mode="portal" />
        </div>
      </section>
    </main>
  );
}

function formatLongDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "long", day: "2-digit" }).format(value);
}
