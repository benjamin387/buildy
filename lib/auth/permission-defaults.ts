import { PERMISSION_MODULE_KEYS, type PermissionModuleKey } from "@/lib/auth/permission-keys";

export type PermissionRuleDefaults = {
  moduleKey: PermissionModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canSend: boolean;
  canExport: boolean;
};

function allFalse(moduleKey: PermissionModuleKey): PermissionRuleDefaults {
  return {
    moduleKey,
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canSend: false,
    canExport: false,
  };
}

function allTrue(moduleKey: PermissionModuleKey): PermissionRuleDefaults {
  return {
    moduleKey,
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canApprove: true,
    canSend: true,
    canExport: true,
  };
}

function director(moduleKey: PermissionModuleKey): PermissionRuleDefaults {
  return {
    moduleKey,
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canApprove: true,
    canSend: true,
    canExport: true,
  };
}

export const DEFAULT_PERMISSION_RULES_BY_ROLE: Record<string, PermissionRuleDefaults[]> = {
  ADMIN: PERMISSION_MODULE_KEYS.map(allTrue),
  DIRECTOR: PERMISSION_MODULE_KEYS.map(director),
  PROJECT_MANAGER: [
    {
      moduleKey: "DASHBOARD",
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
      canSend: false,
      canExport: false,
    },
    { moduleKey: "NOTIFICATIONS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "LEADS", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "PROJECTS", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "DESIGN", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "QUOTATIONS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: true },
    { moduleKey: "CONTRACTS", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canSend: false, canExport: true },
    { moduleKey: "SUPPLIERS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "DOCUMENTS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: true },
    ...(() => {
      const allowed = new Set<PermissionModuleKey>([
        "DASHBOARD",
        "NOTIFICATIONS",
        "LEADS",
        "PROJECTS",
        "DESIGN",
        "QUOTATIONS",
        "CONTRACTS",
        "SUPPLIERS",
        "DOCUMENTS",
      ]);
      return PERMISSION_MODULE_KEYS.filter((m) => !allowed.has(m)).map(allFalse);
    })(),
  ],
  QS: [
    { moduleKey: "DASHBOARD", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "NOTIFICATIONS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "PROJECTS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "DESIGN", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "QUOTATIONS", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: true, canSend: false, canExport: true },
    { moduleKey: "VARIATIONS", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: true, canSend: false, canExport: true },
    { moduleKey: "CONTRACTS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: true },
    { moduleKey: "DOCUMENTS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: true },
    ...(() => {
      const allowed = new Set<PermissionModuleKey>([
        "DASHBOARD",
        "NOTIFICATIONS",
        "PROJECTS",
        "DESIGN",
        "QUOTATIONS",
        "VARIATIONS",
        "CONTRACTS",
        "DOCUMENTS",
      ]);
      return PERMISSION_MODULE_KEYS.filter((m) => !allowed.has(m)).map(allFalse);
    })(),
  ],
  FINANCE: [
    { moduleKey: "DASHBOARD", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "NOTIFICATIONS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "PROJECTS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "QUOTATIONS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: true },
    { moduleKey: "CONTRACTS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: true },
    { moduleKey: "INVOICES", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canSend: true, canExport: true },
    { moduleKey: "RECEIPTS", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canSend: false, canExport: true },
    { moduleKey: "COLLECTIONS", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canSend: true, canExport: true },
    { moduleKey: "CASHFLOW", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: true },
    { moduleKey: "PNL", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: true },
    { moduleKey: "SUPPLIER_BILLS", canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: true, canSend: false, canExport: true },
    { moduleKey: "DOCUMENTS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: true },
    ...(() => {
      const allowed = new Set<PermissionModuleKey>([
        "DASHBOARD",
        "NOTIFICATIONS",
        "PROJECTS",
        "QUOTATIONS",
        "CONTRACTS",
        "INVOICES",
        "RECEIPTS",
        "COLLECTIONS",
        "CASHFLOW",
        "PNL",
        "SUPPLIER_BILLS",
        "DOCUMENTS",
      ]);
      return PERMISSION_MODULE_KEYS.filter((m) => !allowed.has(m)).map(allFalse);
    })(),
  ],
  SUPPLIER: [
    { moduleKey: "NOTIFICATIONS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "SUPPLIERS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    ...(() => {
      const allowed = new Set<PermissionModuleKey>(["NOTIFICATIONS", "SUPPLIERS"]);
      return PERMISSION_MODULE_KEYS.filter((m) => !allowed.has(m)).map(allFalse);
    })(),
  ],
  CLIENT_VIEWER: [
    { moduleKey: "CLIENT_PORTAL", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    { moduleKey: "NOTIFICATIONS", canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canSend: false, canExport: false },
    ...(() => {
      const allowed = new Set<PermissionModuleKey>(["CLIENT_PORTAL", "NOTIFICATIONS"]);
      return PERMISSION_MODULE_KEYS.filter((m) => !allowed.has(m)).map(allFalse);
    })(),
  ],
};
