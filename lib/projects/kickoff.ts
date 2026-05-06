export const PROJECT_KICKOFF_CHECKLIST = [
  { itemKey: "SIGNED_PROPOSAL", label: "Signed proposal" },
  { itemKey: "APPROVED_QUOTATION", label: "Approved quotation" },
  { itemKey: "CONTRACT_GENERATED", label: "Contract generated" },
  { itemKey: "INITIAL_INVOICE_ISSUED", label: "Initial invoice issued" },
  { itemKey: "DEPOSIT_RECEIVED", label: "Deposit received" },
  { itemKey: "SITE_MEASUREMENT_SCHEDULED", label: "Site measurement scheduled" },
  { itemKey: "SUPPLIER_OR_SUBCONTRACTOR_ASSIGNED", label: "Supplier/subcontractor assigned" },
  { itemKey: "PROJECT_TIMELINE_CONFIRMED", label: "Project timeline confirmed" },
  { itemKey: "CLIENT_WHATSAPP_GROUP_CREATED", label: "Client WhatsApp group created" },
  { itemKey: "HANDOVER_TARGET_DATE_SET", label: "Handover target date set" },
] as const;

export type ProjectKickoffItemKey =
  (typeof PROJECT_KICKOFF_CHECKLIST)[number]["itemKey"];

export const PROJECT_KICKOFF_ITEM_KEYS = PROJECT_KICKOFF_CHECKLIST.map(
  (item) => item.itemKey,
) as [ProjectKickoffItemKey, ...ProjectKickoffItemKey[]];

export const PROJECT_KICKOFF_ITEM_COUNT = PROJECT_KICKOFF_CHECKLIST.length;

export function calculateKickoffProgress(
  completedCount: number,
  totalCount: number = PROJECT_KICKOFF_ITEM_COUNT,
): number {
  if (totalCount <= 0) return 0;
  return Math.round((completedCount / totalCount) * 100);
}
