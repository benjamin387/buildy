import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import type { ModuleAccessKey } from "@/lib/auth/module-access-keys";

export const MODULE_ACCESS_TO_PERMISSION_MODULE: Record<ModuleAccessKey, PermissionModuleKey> = {
  dashboard: "DASHBOARD",
  ai_design: "DESIGN",
  design_briefs: "DESIGN",
  design_concepts: "DESIGN",
  design_boq: "DESIGN",
  design_proposals: "DESIGN",
  sales_followup: "AI_ACTIONS",
  projects: "PROJECTS",
  project_cost_control: "PNL",
  variation_orders: "VARIATIONS",
  project_profitability: "PNL",
  quotations: "QUOTATIONS",
  contracts: "CONTRACTS",
  invoices: "INVOICES",
  receipts: "RECEIPTS",
  suppliers: "SUPPLIERS",
  subcontractors: "SUBCONTRACTS",
  purchase_orders: "PURCHASE_ORDERS",
  finance: "PNL",
  cost_ledger: "PNL",
  xero: "SETTINGS",
  settings: "SETTINGS",
  users: "SETTINGS",
  roles_access: "SETTINGS",
};

export function permissionToModuleAccessKey(moduleKey: PermissionModuleKey): ModuleAccessKey[] {
  return (Object.entries(MODULE_ACCESS_TO_PERMISSION_MODULE) as Array<[ModuleAccessKey, PermissionModuleKey]>)
    .filter(([, permission]) => permission === moduleKey)
    .map(([moduleAccessKey]) => moduleAccessKey);
}
