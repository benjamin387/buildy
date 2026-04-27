import "server-only";

import { prisma } from "@/lib/prisma";
import { getCompanySetting } from "@/lib/settings/service";
import { getOrCreateCompanyComplianceProfile } from "@/lib/bidding/compliance-service";
import { AuditAction, AuditSource, TenderGeneratedDocumentStatus, TenderGeneratedDocumentType } from "@prisma/client";
import { logAudit } from "@/lib/audit/logger";

function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "long", day: "2-digit" }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function docTitle(docType: TenderGeneratedDocumentType) {
  switch (docType) {
    case "COMPANY_PROFILE":
      return "Company Profile";
    case "METHOD_STATEMENT":
      return "Method Statement";
    case "ORGANISATION_CHART":
      return "Project Organisation Chart";
    case "SAFETY_PLAN":
      return "Safety Plan";
    case "MANPOWER_PLAN":
      return "Manpower Deployment Plan";
    case "WORK_SCHEDULE":
      return "Work Schedule / Programme";
    case "PROJECT_EXPERIENCE":
      return "Relevant Project Experience";
    case "DECLARATIONS_CHECKLIST":
      return "Declarations Forms Checklist";
    case "SUBMISSION_COVER_LETTER":
      return "Submission Cover Letter";
    default:
      return "Tender Document";
  }
}

async function getApprovedCostingSnapshot(opportunityId: string) {
  const opp = await prisma.bidOpportunity.findUnique({
    where: { id: opportunityId },
    select: { approvedCostVersionId: true, bidPrice: true, estimatedCost: true, finalMargin: true },
  });
  if (!opp?.approvedCostVersionId) return null;
  const version = await prisma.bidCostVersion.findUnique({
    where: { id: opp.approvedCostVersionId },
    include: { lines: { orderBy: [{ sortOrder: "asc" }] } },
  });
  if (!version) return null;
  return {
    bidPrice: Number(version.bidPrice ?? 0),
    totalCost: Number(version.totalCost ?? 0),
    marginPercent: Number(version.marginPercent ?? 0),
    lines: version.lines.map((l) => ({
      tradeKey: String(l.tradeKey),
      description: l.description,
      costAmount: Number(l.costAmount ?? 0),
      sellAmount: Number(l.sellAmount ?? 0),
    })),
  };
}

export async function buildTenderDocumentHtml(params: { opportunityId: string; docType: TenderGeneratedDocumentType }) {
  const [company, compliance, opp, costing] = await Promise.all([
    getCompanySetting(),
    getOrCreateCompanyComplianceProfile(),
    prisma.bidOpportunity.findUnique({
      where: { id: params.opportunityId },
      select: {
        id: true,
        opportunityNo: true,
        title: true,
        agency: true,
        procurementType: true,
        category: true,
        closingDate: true,
        briefingDate: true,
        remarks: true,
      },
    }),
    getApprovedCostingSnapshot(params.opportunityId),
  ]);
  if (!opp) throw new Error("Opportunity not found.");

  const baseStyles = `
    <style>
      :root { color-scheme: light; }
      body { font-family: ui-serif, Georgia, "Times New Roman", Times, serif; margin: 0; padding: 0; color: #0f172a; }
      .page { max-width: 900px; margin: 0 auto; padding: 56px 48px; background: white; }
      .kicker { text-transform: uppercase; letter-spacing: .16em; font-weight: 700; font-size: 12px; color: #64748b; }
      h1 { font-size: 40px; letter-spacing: -0.02em; margin: 12px 0 0; }
      h2 { font-size: 20px; margin: 30px 0 10px; }
      p { font-size: 14px; line-height: 1.7; margin: 10px 0; color: #334155; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 22px; }
      .card { border: 1px solid #e2e8f0; background: #fafaf9; border-radius: 18px; padding: 14px 14px; }
      .label { font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: #64748b; font-weight: 700; }
      .value { font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 6px; }
      table { width: 100%; border-collapse: collapse; margin-top: 14px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; font-size: 12px; }
      th { text-transform: uppercase; letter-spacing: .16em; color: #64748b; text-align: left; font-weight: 700; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: #0f172a; }
      .divider { height: 1px; background: #e2e8f0; margin: 22px 0; }
      .muted { color: #64748b; }
      @media print {
        .page { padding: 28mm 18mm; }
      }
    </style>
  `;

  const header = `
    <div class="kicker">${esc(company.companyName)} · Tender Submission</div>
    <h1>${esc(docTitle(params.docType))}</h1>
    <div class="grid">
      <div class="card"><div class="label">Opportunity</div><div class="value">${esc(opp.opportunityNo)}</div></div>
      <div class="card"><div class="label">Agency</div><div class="value">${esc(opp.agency)}</div></div>
      <div class="card"><div class="label">Closing</div><div class="value">${esc(formatDate(opp.closingDate))}</div></div>
    </div>
    <p class="muted">${esc(opp.title)}</p>
    <div class="divider"></div>
  `;

  const footer = `
    <div class="divider"></div>
    <p class="muted">Prepared by ${esc(company.companyName)} · UEN ${esc(compliance.uen ?? "-")} · ${esc(company.website ?? "https://app.buildy.sg")}</p>
  `;

  const blocks: string[] = [];

  if (params.docType === "COMPANY_PROFILE") {
    blocks.push(`
      <h2>Company Overview</h2>
      <p>${esc(company.companyIntro ?? "We design and build thoughtfully considered interior spaces, combining refined aesthetics with disciplined project controls.")}</p>
      <h2>Registration & Compliance</h2>
      <p><strong>Legal name:</strong> ${esc(compliance.legalName ?? company.legalName ?? company.companyName)}</p>
      <p><strong>UEN:</strong> ${esc(compliance.uen ?? company.uen ?? "-")}</p>
      <p><strong>GST registered:</strong> ${compliance.gstRegistered ? "Yes" : "No"} ${compliance.gstNumber ? `(GST No: ${esc(compliance.gstNumber)})` : ""}</p>
      <p><strong>BCA registration:</strong> ${esc(compliance.bcaRegistration ?? "-")} ${compliance.bcaExpiryDate ? `(Expiry: ${esc(formatDate(compliance.bcaExpiryDate))})` : ""}</p>
      <p><strong>BizSAFE:</strong> ${esc(compliance.bizsafeStatus ?? "-")} ${compliance.bizsafeExpiryDate ? `(Expiry: ${esc(formatDate(compliance.bizsafeExpiryDate))})` : ""}</p>
      <h2>Portfolio Summary</h2>
      <p>${esc(company.portfolioSummary ?? "Residential renovation (HDB, condo, landed) and commercial fit-out delivered with structured scope control.")}</p>
    `);
  }

  if (params.docType === "METHOD_STATEMENT") {
    blocks.push(`
      <h2>Method Statement</h2>
      <p>This method statement outlines our proposed approach for planning, execution, quality control and stakeholder coordination for the tender scope.</p>
      <h2>Work Approach</h2>
      <p><strong>1) Mobilisation:</strong> site verification, risk assessment, schedule baseline, and stakeholder alignment.</p>
      <p><strong>2) Execution:</strong> disciplined work sequencing with daily progress controls and variation governance.</p>
      <p><strong>3) Quality:</strong> inspection checkpoints per trade, mock-up approvals where required, and punch-list controls.</p>
      <p><strong>4) Handover:</strong> final inspection, defects rectification, documentation and warranties handover.</p>
    `);
  }

  if (params.docType === "ORGANISATION_CHART") {
    blocks.push(`
      <h2>Project Organisation</h2>
      <p>Below is a standard project organisation structure. Named personnel will be confirmed at award stage based on availability and contract requirements.</p>
      <table>
        <thead><tr><th>Role</th><th>Responsibilities</th></tr></thead>
        <tbody>
          <tr><td><strong>Project Director</strong></td><td>Executive oversight, risk governance, approvals.</td></tr>
          <tr><td><strong>Project Manager</strong></td><td>Programme, coordination, site supervision, progress reporting.</td></tr>
          <tr><td><strong>Quantity Surveyor</strong></td><td>Cost control, VO governance, claims and commercial tracking.</td></tr>
          <tr><td><strong>Safety Officer</strong></td><td>WSH compliance, RA/SWP controls, incident management.</td></tr>
          <tr><td><strong>Site Supervisor</strong></td><td>Daily execution, trade coordination, QC checks.</td></tr>
        </tbody>
      </table>
    `);
  }

  if (params.docType === "SAFETY_PLAN") {
    blocks.push(`
      <h2>Safety Plan (WSH)</h2>
      <p>We implement a WSH management approach aligned to the project risk profile, including RA/SWP where applicable.</p>
      <h2>Key Controls</h2>
      <p><strong>Site induction:</strong> mandatory briefing for all personnel and subcontractors before work starts.</p>
      <p><strong>Risk assessment:</strong> trade-based RA and daily toolbox briefings.</p>
      <p><strong>Permit-to-work:</strong> hot works / electrical isolation / confined space if required.</p>
      <p><strong>PPE & housekeeping:</strong> enforced standards, barricading and signage.</p>
    `);
  }

  if (params.docType === "MANPOWER_PLAN") {
    blocks.push(`
      <h2>Manpower Deployment Plan</h2>
      <p>Manpower will be staged based on work sequencing. Actual deployment will be refined at award stage once the final programme is confirmed.</p>
      <table>
        <thead><tr><th>Phase</th><th>Typical Resources</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td><strong>Mobilisation</strong></td><td>PM, Supervisor, QS</td><td>Site verification, schedule and RA.</td></tr>
          <tr><td><strong>Core works</strong></td><td>Trade supervisors, subcontract teams</td><td>Daily coordination and inspections.</td></tr>
          <tr><td><strong>Finishes</strong></td><td>Finishing trades</td><td>Mock-ups and final QC.</td></tr>
          <tr><td><strong>Handover</strong></td><td>PM, Supervisor</td><td>Punch list closure and documentation.</td></tr>
        </tbody>
      </table>
    `);
  }

  if (params.docType === "WORK_SCHEDULE") {
    blocks.push(`
      <h2>Work Schedule / Programme</h2>
      <p>This programme is a baseline and will be updated upon award and post-site verification.</p>
      <p><strong>Key milestones:</strong> mobilisation, demolition, MEP coordination, carpentry installation, finishes, testing and commissioning, handover.</p>
      <p class="muted">Note: Specific durations depend on scope finalisation, access constraints, and authority approvals (if applicable).</p>
    `);
  }

  if (params.docType === "PROJECT_EXPERIENCE") {
    blocks.push(`
      <h2>Relevant Experience</h2>
      <p>Selected projects demonstrating our capability in interior renovation and commercial fit-out. Detailed references can be provided upon request.</p>
      <table>
        <thead><tr><th>Project Type</th><th>Scope</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td><strong>Residential Renovation</strong></td><td>HDB / Condo / Landed</td><td>Full scope, coordination and handover controls.</td></tr>
          <tr><td><strong>Commercial Fit-Out</strong></td><td>Office / Retail / F&B</td><td>Programme-driven delivery with compliance controls.</td></tr>
        </tbody>
      </table>
    `);
  }

  if (params.docType === "DECLARATIONS_CHECKLIST") {
    blocks.push(`
      <h2>Declarations Checklist</h2>
      <p>Use this checklist to confirm all tender forms and declarations are included in the final submission pack.</p>
      <table>
        <thead><tr><th>Item</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Forms signed and dated</td><td>☐</td></tr>
          <tr><td>Authorised signatory details</td><td>☐</td></tr>
          <tr><td>Insurance declarations</td><td>☐</td></tr>
          <tr><td>BizSAFE / compliance declarations</td><td>☐</td></tr>
          <tr><td>Pricing breakdown confirmation</td><td>☐</td></tr>
        </tbody>
      </table>
    `);
  }

  if (params.docType === "SUBMISSION_COVER_LETTER") {
    blocks.push(`
      <h2>Cover Letter</h2>
      <p><strong>To:</strong> ${esc(opp.agency)}</p>
      <p><strong>Re:</strong> ${esc(opp.opportunityNo)} · ${esc(opp.title)}</p>
      <p>We are pleased to submit our proposal for the above opportunity. Our submission includes the required documentation, technical methodology, programme and commercial pricing in accordance with the tender requirements.</p>
      <p>We confirm that the information provided is true and accurate to the best of our knowledge. We look forward to the opportunity to clarify and support your evaluation.</p>
      ${costing ? `<p><strong>Commercial summary:</strong> Bid price ${esc(formatCurrency(costing.bidPrice))} (estimated cost ${esc(formatCurrency(costing.totalCost))}).</p>` : `<p class="muted">Commercial summary will be inserted once costing is approved.</p>`}
      <p>Yours sincerely,<br/><strong>${esc(company.companyName)}</strong></p>
    `);
  }

  // Optional costing appendix in selected docs.
  if (costing && (params.docType === "METHOD_STATEMENT" || params.docType === "COMPANY_PROFILE")) {
    blocks.push(`
      <h2>Costing Snapshot (Approved)</h2>
      <table>
        <thead><tr><th>Trade</th><th>Description</th><th class="num">Cost</th><th class="num">Sell</th></tr></thead>
        <tbody>
          ${costing.lines
            .map(
              (l) =>
                `<tr><td><strong>${esc(l.tradeKey.replaceAll("_", " "))}</strong></td><td>${esc(l.description)}</td><td class="num">${esc(formatCurrency(l.costAmount))}</td><td class="num">${esc(formatCurrency(l.sellAmount))}</td></tr>`,
            )
            .join("")}
          <tr><td colspan="2"><strong>Total</strong></td><td class="num">${esc(formatCurrency(costing.totalCost))}</td><td class="num">${esc(formatCurrency(costing.bidPrice))}</td></tr>
        </tbody>
      </table>
    `);
  }

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${esc(docTitle(params.docType))} · ${esc(opp.opportunityNo)}</title>
        ${baseStyles}
      </head>
      <body>
        <div class="page">
          ${header}
          ${blocks.join("\n")}
          ${footer}
        </div>
      </body>
    </html>
  `;

  return { title: docTitle(params.docType), html };
}

export async function generateTenderDocument(params: {
  opportunityId: string;
  docType: TenderGeneratedDocumentType;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const latest = await prisma.tenderGeneratedDocument.aggregate({
    where: { opportunityId: params.opportunityId, docType: params.docType },
    _max: { versionNo: true },
  });
  const next = (latest._max.versionNo != null ? Number(latest._max.versionNo) : 0) + 1;

  const content = await buildTenderDocumentHtml({ opportunityId: params.opportunityId, docType: params.docType });
  const row = await prisma.tenderGeneratedDocument.create({
    data: {
      opportunityId: params.opportunityId,
      docType: params.docType,
      versionNo: next,
      title: content.title,
      contentHtml: content.html,
      status: TenderGeneratedDocumentStatus.GENERATED,
      createdByName: params.actor?.name ?? null,
      createdByEmail: params.actor?.email ?? null,
    },
  });

  await logAudit({
    entityType: "TenderGeneratedDocument",
    entityId: row.id,
    action: AuditAction.CREATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: null,
    after: { id: row.id, opportunityId: row.opportunityId, docType: row.docType, versionNo: row.versionNo, status: row.status },
    metadata: { title: row.title },
  });

  return row;
}

