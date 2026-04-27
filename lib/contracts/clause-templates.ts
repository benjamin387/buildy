import { ClauseTemplateCategory } from "@prisma/client";

export type ClauseTemplateSeed = {
  code: string;
  title: string;
  content: string;
  category: ClauseTemplateCategory;
  isDefault: boolean;
};

export const DEFAULT_CONTRACT_CLAUSE_ORDER: string[] = [
  "SCOPE_OF_WORKS",
  "CONTRACT_SUM",
  "PAYMENT_TERMS",
  "VARIATION",
  "TIMELINE_COMPLETION",
  "DEFECTS_WARRANTY",
  "LIQUIDATED_DAMAGES",
  "INSURANCE",
  "INDEMNITY",
  "TERMINATION",
  "COMMUNICATION",
  "GOVERNING_LAW",
];

export function getDefaultClauseTemplates(): ClauseTemplateSeed[] {
  // Note: These templates are intended as a professional baseline and should be reviewed
  // and tailored by your legal counsel for your business use.
  return [
    {
      code: "SCOPE_OF_WORKS",
      title: "Scope of Works",
      category: ClauseTemplateCategory.SCOPE,
      isDefault: true,
      content: [
        "1. The Contractor shall carry out the renovation and/or interior fit-out works (the \"Works\") at the Site for the Project as described in the accepted Quotation and the scope schedule attached to this Contract.",
        "2. The Works include only those items expressly stated as included. Any items marked optional or excluded, and any works not expressly described, are excluded unless subsequently agreed as a Variation under this Contract.",
        "3. Where specifications, dimensions, or site conditions differ from assumptions used to price the Quotation, the Parties shall address the impact by a Variation prior to the affected works being carried out.",
      ].join("\n"),
    },
    {
      code: "CONTRACT_SUM",
      title: "Contract Sum",
      category: ClauseTemplateCategory.PAYMENT,
      isDefault: true,
      content: [
        "1. The Contract Sum shall be the total amount stated in this Contract, derived from the accepted Quotation (including any agreed discounts) plus applicable GST.",
        "2. The Contract Sum excludes any future Variations unless and until approved in accordance with this Contract.",
        "3. Unless otherwise agreed in writing, prices are in Singapore Dollars (SGD).",
      ].join("\n"),
    },
    {
      code: "PAYMENT_TERMS",
      title: "Payment Terms",
      category: ClauseTemplateCategory.PAYMENT,
      isDefault: true,
      content: [
        "1. The Client shall make payments strictly in accordance with the payment schedule set out in this Contract (the \"Payment Schedule\").",
        "2. Each payment shall be due within the due days specified in the Payment Schedule (or, if not specified for a particular stage, within 7 days of the relevant invoice or payment request).",
        "3. Late Payment Interest: If any amount is not paid when due, the Contractor may charge interest on the overdue amount at 1% per month (or the maximum rate permitted by law), calculated daily from the due date until actual payment.",
        "4. Right to Suspend Work: If any amount remains unpaid 7 days after written notice of non-payment, the Contractor may suspend the Works (including demobilisation) until payment is received. Any delay and costs resulting from such suspension shall be treated as a Variation and/or an extension of time.",
        "5. All payments shall be made by bank transfer to the Contractor’s nominated account, unless otherwise agreed in writing.",
      ].join("\n"),
    },
    {
      code: "VARIATION",
      title: "Variation",
      category: ClauseTemplateCategory.VARIATION,
      isDefault: true,
      content: [
        "1. Written Instruction Required: No change to the Works shall be carried out unless the Client (or the Client’s authorised representative) issues a written instruction and the Contractor issues a written variation quotation or variation order (a \"Variation\").",
        "2. Quotation Before Execution: The Contractor shall, where reasonably practicable, provide the Client with a written quotation describing (i) the scope of change, (ii) the cost impact, and (iii) the time impact before the Variation is executed.",
        "3. Approval Requirement: A Variation is only valid if accepted/approved in writing by the Client prior to execution. Where the Client requests urgent works such that prior quotation is impracticable, the Parties shall confirm the Variation in writing as soon as reasonably possible, and the Contractor may proceed only to the extent necessary to mitigate risk or prevent damage.",
        "4. Cost and Time Impact: Approved Variations shall adjust the Contract Sum and/or completion timeline accordingly. Any additional materials lead time, access constraints, or rework required due to a Variation shall be taken into account.",
        "5. Unapproved Variations: Any works requested but not approved in accordance with this clause are excluded from the Contract Sum and may be declined by the Contractor.",
      ].join("\n"),
    },
    {
      code: "TIMELINE_COMPLETION",
      title: "Timeline & Completion",
      category: ClauseTemplateCategory.TIMELINE,
      isDefault: true,
      content: [
        "1. The indicative start date and target completion date (if stated) are estimates dependent on timely client approvals, access, and supply lead times.",
        "2. The Contractor shall be entitled to a reasonable extension of time for delays caused by (i) Variations, (ii) late instructions or approvals, (iii) late delivery of client-supplied items, (iv) restricted access, (v) unforeseen site conditions, or (vi) events beyond the Contractor’s reasonable control.",
        "3. Practical Completion occurs when the Works are substantially complete and capable of being used for their intended purpose, notwithstanding minor defects or omissions that do not materially prevent use.",
      ].join("\n"),
    },
    {
      code: "DEFECTS_WARRANTY",
      title: "Defects Liability / Warranty",
      category: ClauseTemplateCategory.WARRANTY,
      isDefault: true,
      content: [
        "1. Defects Liability Period: The defects liability period shall be {{defectsLiabilityDays}} days from Practical Completion (or, if not specified, 30 days).",
        "2. Warranty: The Contractor warrants workmanship for {{warrantyMonths}} months from Practical Completion (or, if not specified, 12 months), excluding fair wear and tear, misuse, lack of maintenance, and defects arising from third-party works or client-supplied materials.",
        "3. Rectification Obligation: If defects attributable to the Contractor’s workmanship are notified in writing during the defects liability period, the Contractor shall rectify such defects within a reasonable time (typically within 14 days, subject to access and materials availability).",
        "4. Access: The Client shall provide reasonable access to allow inspection and rectification works.",
      ].join("\n"),
    },
    {
      code: "LIQUIDATED_DAMAGES",
      title: "Liquidated Damages",
      category: ClauseTemplateCategory.LEGAL,
      isDefault: true,
      content: [
        "1. If the Contractor fails to achieve Practical Completion by the agreed completion date (as adjusted for extensions of time), the Parties may agree liquidated damages (LD) at a rate stated in this Contract, if any.",
        "2. If no LD rate is stated, no liquidated damages apply. This clause does not limit any other rights expressly set out in this Contract.",
      ].join("\n"),
    },
    {
      code: "INSURANCE",
      title: "Insurance",
      category: ClauseTemplateCategory.LEGAL,
      isDefault: true,
      content: [
        "1. The Contractor shall maintain, where reasonably required for the Works, appropriate insurance such as public liability and work injury compensation for its personnel and subcontractors.",
        "2. The Client remains responsible for the Client’s own insurance of the premises and contents, including coverage for existing fixtures and client-supplied items, unless otherwise agreed in writing.",
      ].join("\n"),
    },
    {
      code: "INDEMNITY",
      title: "Indemnity",
      category: ClauseTemplateCategory.LEGAL,
      isDefault: true,
      content: [
        "1. The Contractor shall indemnify the Client against third-party claims to the extent arising directly from the Contractor’s negligent acts or omissions in carrying out the Works, subject to limitations permitted by law and excluding indirect or consequential losses.",
        "2. The Client shall indemnify the Contractor against claims arising from the Client’s instructions, client-supplied materials/items, or third-party works engaged by the Client.",
      ].join("\n"),
    },
    {
      code: "TERMINATION",
      title: "Termination",
      category: ClauseTemplateCategory.LEGAL,
      isDefault: true,
      content: [
        "1. The Contractor may terminate this Contract by written notice if the Client fails to pay any undisputed amount within 14 days of written notice of default, or if the Client otherwise commits a material breach and fails to remedy such breach within a reasonable time after notice.",
        "2. The Client may terminate this Contract by written notice if the Contractor commits a material breach and fails to remedy such breach within a reasonable time after notice.",
        "3. Upon termination, the Client shall pay the Contractor for (i) Works completed to date, (ii) materials ordered or delivered, and (iii) reasonable demobilisation and termination costs. Any discounts contingent on completion may be forfeited.",
      ].join("\n"),
    },
    {
      code: "COMMUNICATION",
      title: "Communication",
      category: ClauseTemplateCategory.LEGAL,
      isDefault: true,
      content: [
        "1. Notices and approvals under this Contract shall be in writing.",
        "2. The Parties agree that written communications via email and WhatsApp (including clear acknowledgements) may constitute written notice and/or approval for the purposes of this Contract, provided the sender is an authorised representative and the communication is reasonably identifiable to the Project.",
      ].join("\n"),
    },
    {
      code: "GOVERNING_LAW",
      title: "Governing Law",
      category: ClauseTemplateCategory.LEGAL,
      isDefault: true,
      content: [
        "1. This Contract shall be governed by and construed in accordance with the laws of Singapore.",
        "2. The Parties submit to the non-exclusive jurisdiction of the courts of Singapore.",
      ].join("\n"),
    },
  ];
}

