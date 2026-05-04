import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActivePublicLinkByToken, markPublicLinkViewed } from "@/lib/messaging/public-links";
import type { PublicDocumentType } from "@prisma/client";
import { PrintButton } from "@/app/public/documents/[token]/print-button";
import { getCompanyBranding } from "@/lib/branding";
import { ProposalPresentation, type ProposalPresentationData } from "@/app/components/proposal/proposal-presentation";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await getActivePublicLinkByToken(token);
  if (!link) notFound();

  if (link.documentType === "VARIATION_ORDER") {
    redirect(`/public/variations/${token}`);
  }

  // Record view (best-effort).
  await markPublicLinkViewed(link.id);

  const document = await fetchDocument(link.documentType, link.documentId);
  if (!document) notFound();
  const isPresentation = link.documentType === "DESIGN_PRESENTATION";

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10 text-neutral-900 sm:px-6">
      <div className={isPresentation ? "mx-auto max-w-6xl space-y-6" : "mx-auto max-w-5xl space-y-6"}>
        <header className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Secure document link</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
            {document.title}
          </h1>
          <p className="mt-3 text-sm leading-7 text-neutral-600">
            This link is token-protected. If you are not an intended recipient, please close this page.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <PrintButton />
            <Link
              href="/client/login"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              Client portal login
            </Link>
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              Home
            </Link>
          </div>
        </header>

        {isPresentation ? (
          <div>{document.body}</div>
        ) : (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]">
            {document.body}
          </div>
        )}

        <footer className="text-center text-xs text-neutral-500">
          Viewed {formatDate(new Date())} · Expires {formatDate(link.expiresAt)}
        </footer>
      </div>
    </main>
  );
}

async function fetchDocument(documentType: PublicDocumentType, documentId: string): Promise<{
  title: string;
  body: React.ReactNode;
} | null> {
  switch (documentType) {
    case "DESIGN_PRESENTATION":
      return fetchDesignPresentation(documentId);
    case "INVOICE":
      return fetchInvoice(documentId);
    case "QUOTATION":
      return fetchQuotation(documentId);
    case "CONTRACT":
      return fetchContract(documentId);
    case "PURCHASE_ORDER":
      return fetchPurchaseOrder(documentId);
    case "SUBCONTRACT":
      return fetchSubcontract(documentId);
    case "SUPPLIER_BILL":
      return fetchSupplierBill(documentId);
    case "COLLECTION_REMINDER":
      return fetchCollectionReminder(documentId);
    default:
      return null;
  }
}

async function fetchDesignPresentation(briefId: string) {
  const branding = await getCompanyBranding();
  const brief = await prisma.designBrief.findUnique({
    where: { id: briefId },
    include: {
      project: { include: { client: true } },
      presentation: true,
      areas: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          layoutPlans: { orderBy: [{ createdAt: "desc" }], take: 1 },
          visualRenders: { orderBy: [{ createdAt: "desc" }], take: 1 },
          ffeProposals: { orderBy: [{ createdAt: "desc" }], take: 100 },
          qsBoqDraftItems: { orderBy: [{ sortOrder: "asc" }], take: 2000 },
        },
      },
    },
  });
  if (!brief) return null;

  const title = brief.presentation?.title ?? `${brief.project?.name ?? "Project"} Design Presentation`;
  const clientName = brief.project?.client?.name ?? brief.project?.clientName ?? "Client";
  const projectName = brief.project?.name ?? "Project";
  const address = brief.project?.siteAddress || brief.project?.addressLine1 || "-";

  const qsSellingTotal = brief.areas.reduce(
    (sum, a) => sum + a.qsBoqDraftItems.reduce((s2, i) => s2 + Number(i.sellingTotal), 0),
    0,
  );

  const ffeTotal = brief.areas.reduce(
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

  const data: ProposalPresentationData = {
    branding,
    title,
    subtitle: `Design presentation · ${String(brief.propertyType)} · ${String(brief.designStyle ?? "STYLE")}`,
    addressedTo: brief.presentation?.addressedTo ?? clientName,
    projectName,
    projectAddress: address,
    dateLabel: formatDate(brief.presentation?.presentationDate ?? new Date()),
    heroImageUrl,
    designConceptText: brief.presentation?.introductionText ?? brief.clientNeeds,
    roomNarrativeText: brief.presentation?.roomNarrativeText ?? null,
    materialExplanationText: brief.presentation?.materialExplanationText ?? null,
    budgetExplanationText: brief.presentation?.budgetExplanationText ?? null,
    whyChooseUsText: brief.presentation?.whyChooseUsText ?? null,
    upsellPitchText: brief.presentation?.upsellPitchText ?? null,
    nextStepsText: brief.presentation?.nextStepsText ?? null,
    areas,
    ffeItems,
    boqRows,
    preliminaryBuild: qsSellingTotal,
    ffeAllowance: ffeTotal,
    quotationTotal: null,
    includeWhyChooseUs: true,
    primaryCta: { label: "Review Quotation", href: "/client/login" },
    secondaryCta: { label: "Request Changes", href: `mailto:${branding.contactEmail}?subject=${encodeURIComponent(`${projectName} — Presentation feedback`)}` },
  };

  return {
    title,
    body: (
      <ProposalPresentation data={data} mode="public" />
    ),
  };
}

async function fetchInvoice(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      project: { include: { client: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!inv) return null;

  const billToName = inv.project.clientName || inv.project.client?.name || inv.project.client?.companyName || "Client";
  const billToEmail = inv.project.clientEmail || inv.project.client?.email || "-";
  const billToPhone = inv.project.clientPhone || inv.project.client?.phone || "-";

  return {
    title: `Invoice ${inv.invoiceNumber}`,
    body: (
      <div className="space-y-6">
        <section className="grid gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Bill To</p>
            <p className="mt-2 font-semibold text-neutral-950">{billToName}</p>
            <p className="text-neutral-700">{billToEmail}</p>
            <p className="text-neutral-700">{billToPhone}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Invoice</p>
            <p className="mt-2 font-semibold text-neutral-950">{inv.invoiceNumber}</p>
            <p className="text-neutral-700">Issue: {formatDate(inv.issueDate)}</p>
            <p className="text-neutral-700">Due: {formatDate(inv.dueDate)}</p>
            <p className="mt-2 text-neutral-700">
              Project: {inv.project.name} ({inv.project.projectCode ?? inv.project.id.slice(0, 8)})
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Description</th>
                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                <th className="px-4 py-3 text-right font-semibold">Unit Price</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lineItems.map((l) => (
                <tr key={l.id} className="border-t border-neutral-200">
                  <td className="px-4 py-3 text-neutral-900">{l.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{Number(l.quantity).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{formatCurrency(Number(l.unitPrice))}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-neutral-950">{formatCurrency(Number(l.lineAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-neutral-800">{inv.notes ?? "-"}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Subtotal</span>
              <span className="font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(inv.subtotal))}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-neutral-600">Discount</span>
              <span className="font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(inv.discountAmount))}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-neutral-600">GST</span>
              <span className="font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(inv.taxAmount))}</span>
            </div>
            <div className="mt-3 border-t border-neutral-200 pt-3 flex items-center justify-between">
              <span className="text-neutral-600">Total</span>
              <span className="text-lg font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(inv.totalAmount))}</span>
            </div>
          </div>
        </section>
      </div>
    ),
  };
}

async function fetchQuotation(quotationId: string) {
  const q = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      paymentTermsV2: { orderBy: { sortOrder: "asc" } },
      sections: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!q) return null;

  return {
    title: `Quotation ${q.quotationNumber} (V${q.version})`,
    body: (
      <div className="space-y-6">
        <section className="grid gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Quotation</p>
            <p className="mt-2 font-semibold text-neutral-950">{q.quotationNumber}</p>
            <p className="text-neutral-700">Version: {q.version}</p>
            <p className="text-neutral-700">Issue: {formatDate(q.issueDate)}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Totals</p>
            <p className="mt-2 text-neutral-700">Subtotal: {formatCurrency(Number(q.subtotal))}</p>
            <p className="text-neutral-700">GST: {formatCurrency(Number(q.gstAmount))}</p>
            <p className="font-semibold text-neutral-950">Total: {formatCurrency(Number(q.totalAmount))}</p>
          </div>
        </section>

        {q.paymentTermsV2.length > 0 ? (
          <section className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Payment Terms</th>
                  <th className="px-4 py-3 text-right font-semibold">%</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {q.paymentTermsV2.map((t) => (
                  <tr key={t.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 text-neutral-900">{t.title}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900">
                      {t.percent === null ? "-" : `${Number(t.percent).toFixed(2)}%`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-neutral-950">
                      {t.amount === null ? "-" : formatCurrency(Number(t.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {q.sections.map((s) => (
          <section key={s.id} className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">{s.title}</h2>
                {s.description ? <p className="text-sm text-neutral-600">{s.description}</p> : null}
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Subtotal</p>
                <p className="mt-1 font-semibold text-neutral-950 tabular-nums">{formatCurrency(Number(s.subtotal))}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">SKU</th>
                    <th className="px-4 py-3 text-left font-semibold">Description</th>
                    <th className="px-4 py-3 text-right font-semibold">Qty</th>
                    <th className="px-4 py-3 text-right font-semibold">Unit</th>
                    <th className="px-4 py-3 text-right font-semibold">Unit Price</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lineItems.map((i) => (
                    <tr key={i.id} className="border-t border-neutral-200">
                      <td className="px-4 py-3 text-neutral-900">{i.sku ?? "-"}</td>
                      <td className="px-4 py-3 text-neutral-900">{i.description}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{Number(i.quantity).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-neutral-700">{i.unit ?? "-"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{formatCurrency(Number(i.unitPrice))}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-neutral-950">{formatCurrency(Number(i.totalPrice))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    ),
  };
}

async function fetchContract(contractId: string) {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { clauses: { orderBy: { sortOrder: "asc" } }, milestones: { orderBy: { sortOrder: "asc" } } },
  });
  if (!c) return null;

  return {
    title: `Contract ${c.contractNumber} (V${c.version})`,
    body: (
      <div className="space-y-6">
        <section className="grid gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Contract</p>
            <p className="mt-2 font-semibold text-neutral-950">{c.contractNumber}</p>
            <p className="text-neutral-700">Status: {c.status}</p>
            <p className="text-neutral-700">Date: {formatDate(c.contractDate)}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Total</p>
            <p className="mt-2 text-lg font-semibold text-neutral-950 tabular-nums">{formatCurrency(Number(c.totalAmount))}</p>
            <p className="text-neutral-700">GST: {formatCurrency(Number(c.gstAmount))}</p>
          </div>
        </section>

        {c.milestones.length > 0 ? (
          <section className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Milestones</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {c.milestones.map((m) => (
                  <tr key={m.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 text-neutral-900">{m.title}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-neutral-950">{formatCurrency(Number(m.amount))}</td>
                    <td className="px-4 py-3 text-neutral-700">{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-950">Clauses</h2>
          <div className="grid gap-3">
            {c.clauses.map((clause) => (
              <div key={clause.id} className="rounded-xl border border-neutral-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{clause.clauseKey}</p>
                <p className="mt-2 text-base font-semibold text-neutral-950">{clause.title}</p>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-800">{clause.content}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    ),
  };
}

async function fetchPurchaseOrder(poId: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { supplier: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!po) return null;

  return {
    title: `Purchase Order ${po.poNumber}`,
    body: (
      <div className="space-y-6">
        <section className="grid gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Supplier</p>
            <p className="mt-2 font-semibold text-neutral-950">{po.supplier.name}</p>
            <p className="text-neutral-700">{po.supplier.email ?? "-"}</p>
            <p className="text-neutral-700">{po.supplier.phone ?? "-"}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">PO</p>
            <p className="mt-2 font-semibold text-neutral-950">{po.poNumber}</p>
            <p className="text-neutral-700">Issue: {formatDate(po.issueDate)}</p>
            <p className="text-neutral-700">Expected: {formatDate(po.expectedDeliveryDate)}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Description</th>
                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                <th className="px-4 py-3 text-right font-semibold">Unit Cost</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.id} className="border-t border-neutral-200">
                  <td className="px-4 py-3 text-neutral-900">{l.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{Number(l.quantity).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{formatCurrency(Number(l.unitCost))}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-neutral-950">{formatCurrency(Number(l.lineAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-neutral-800">{po.notes ?? "-"}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Subtotal</span>
              <span className="font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(po.subtotal))}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-neutral-600">Tax</span>
              <span className="font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(po.taxAmount))}</span>
            </div>
            <div className="mt-3 border-t border-neutral-200 pt-3 flex items-center justify-between">
              <span className="text-neutral-600">Total</span>
              <span className="text-lg font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(po.totalAmount))}</span>
            </div>
          </div>
        </section>
      </div>
    ),
  };
}

async function fetchSubcontract(subcontractId: string) {
  const sc = await prisma.subcontract.findUnique({
    where: { id: subcontractId },
    include: { supplier: true },
  });
  if (!sc) return null;

  return {
    title: `Subcontract ${sc.title}`,
    body: (
      <div className="space-y-6">
        <section className="grid gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Supplier</p>
            <p className="mt-2 font-semibold text-neutral-950">{sc.supplier.name}</p>
            <p className="text-neutral-700">{sc.supplier.email ?? "-"}</p>
            <p className="text-neutral-700">{sc.supplier.phone ?? "-"}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Value</p>
            <p className="mt-2 text-lg font-semibold text-neutral-950 tabular-nums">{formatCurrency(Number(sc.totalAmount))}</p>
            <p className="text-neutral-700">Status: {sc.status}</p>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Scope Summary</p>
          <p className="mt-2 whitespace-pre-wrap text-neutral-800">{sc.scopeSummary ?? "-"}</p>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Controls</p>
          <div className="mt-3 grid gap-2">
            <p className="text-neutral-800">Payment terms: {sc.paymentTerms ?? "-"}</p>
            <p className="text-neutral-800">Warranty: {sc.warrantyTerms ?? "-"}</p>
            <p className="text-neutral-800">Variation: {sc.variationPolicy ?? "-"}</p>
            <p className="text-neutral-800">Defects: {sc.defectsPolicy ?? "-"}</p>
            <p className="text-neutral-800">Insurance: {sc.insurancePolicy ?? "-"}</p>
          </div>
        </section>
      </div>
    ),
  };
}

async function fetchSupplierBill(billId: string) {
  const bill = await prisma.supplierBill.findUnique({
    where: { id: billId },
    include: { supplier: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!bill) return null;

  return {
    title: `Supplier Bill ${bill.billNumber}`,
    body: (
      <div className="space-y-6">
        <section className="grid gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Supplier</p>
            <p className="mt-2 font-semibold text-neutral-950">{bill.supplier.name}</p>
            <p className="text-neutral-700">{bill.supplier.email ?? "-"}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Bill</p>
            <p className="mt-2 font-semibold text-neutral-950">{bill.billNumber}</p>
            <p className="text-neutral-700">Bill date: {formatDate(bill.billDate)}</p>
            <p className="text-neutral-700">Due: {formatDate(bill.dueDate)}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Description</th>
                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                <th className="px-4 py-3 text-right font-semibold">Unit Cost</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((l) => (
                <tr key={l.id} className="border-t border-neutral-200">
                  <td className="px-4 py-3 text-neutral-900">{l.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{Number(l.quantity).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{formatCurrency(Number(l.unitCost))}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-neutral-950">{formatCurrency(Number(l.lineAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-neutral-800">{bill.notes ?? "-"}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Subtotal</span>
              <span className="font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(bill.subtotal))}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-neutral-600">Tax</span>
              <span className="font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(bill.taxAmount))}</span>
            </div>
            <div className="mt-3 border-t border-neutral-200 pt-3 flex items-center justify-between">
              <span className="text-neutral-600">Total</span>
              <span className="text-lg font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(bill.totalAmount))}</span>
            </div>
          </div>
        </section>
      </div>
    ),
  };
}

async function fetchCollectionReminder(caseId: string) {
  const c = await prisma.collectionCase.findUnique({
    where: { id: caseId },
    include: {
      project: { select: { id: true, name: true, projectCode: true } },
      invoice: { select: { id: true, invoiceNumber: true, issueDate: true, dueDate: true, totalAmount: true, outstandingAmount: true } },
    },
  });
  if (!c) return null;

  return {
    title: `Payment Reminder: ${c.invoice.invoiceNumber}`,
    body: (
      <div className="space-y-6 text-sm">
        <section className="grid gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Debtor</p>
            <p className="mt-2 font-semibold text-neutral-950">{c.debtorName}</p>
            <p className="text-neutral-700">{c.debtorEmail ?? "-"}</p>
            <p className="text-neutral-700">{c.debtorPhone ?? "-"}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Invoice</p>
            <p className="mt-2 font-semibold text-neutral-950">{c.invoice.invoiceNumber}</p>
            <p className="text-neutral-700">Due: {formatDate(c.dueDate)}</p>
            <p className="text-neutral-700">DPD: {c.daysPastDue}</p>
          </div>
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Total</span>
            <span className="font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(c.invoice.totalAmount))}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-neutral-600">Outstanding</span>
            <span className="text-lg font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(c.outstandingAmount))}</span>
          </div>
          <p className="mt-3 text-neutral-700">
            Project: {c.project.name} ({c.project.projectCode ?? c.project.id.slice(0, 8)})
          </p>
        </section>
      </div>
    ),
  };
}
