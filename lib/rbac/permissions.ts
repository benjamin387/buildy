import { Permission } from "@prisma/client";

export const MODULE_PERMISSIONS = {
  PROJECTS: [
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_MEMBER_MANAGE,
    Permission.PM_UPDATE_READ,
    Permission.PM_UPDATE_WRITE,
    Permission.COMMS_READ,
    Permission.COMMS_WRITE,
    Permission.PNL_READ,
  ],
  QUOTATIONS: [
    Permission.QUOTE_READ,
    Permission.QUOTE_WRITE,
    Permission.QUOTE_APPROVE,
    Permission.QUOTE_EXPORT_PDF,
    Permission.BOQ_READ,
    Permission.BOQ_WRITE,
    Permission.BOQ_IMPORT,
  ],
  CONTRACTS: [
    Permission.CONTRACT_READ,
    Permission.CONTRACT_WRITE,
    Permission.CONTRACT_APPROVE,
    Permission.CONTRACT_EXPORT_PDF,
  ],
  INVOICES: [
    Permission.INVOICE_READ,
    Permission.INVOICE_WRITE,
    Permission.INVOICE_SEND,
    Permission.INVOICE_EXPORT_PDF,
    Permission.PAYMENT_RECORD,
  ],
  SUPPLIERS: [
    Permission.SUPPLIER_READ,
    Permission.SUPPLIER_WRITE,
    Permission.SUBCONTRACT_READ,
    Permission.SUBCONTRACT_WRITE,
    Permission.SUBCONTRACT_APPROVE,
  ],
  SETTINGS: [
    Permission.SETTINGS_READ,
    Permission.SETTINGS_WRITE,
    Permission.AUDIT_READ,
  ],
  SECURITY: [
    Permission.SECURITY_READ,
    Permission.SECURITY_WRITE,
  ],
} as const;

export type AppRoleKey =
  | "ADMIN"
  | "DIRECTOR"
  | "PROJECT_MANAGER"
  | "QS"
  | "FINANCE"
  | "SUPPLIER"
  | "CLIENT_VIEWER";

type RoleDefinition = {
  key: AppRoleKey;
  name: string;
  description: string;
  permissions: Permission[];
};

const ALL_MODULE_PERMISSIONS = Object.values(MODULE_PERMISSIONS).flat();
const SECURITY_SELF_SERVICE = [Permission.SECURITY_READ, Permission.SECURITY_WRITE];

export const ROLE_PRIORITY: AppRoleKey[] = [
  "ADMIN",
  "DIRECTOR",
  "PROJECT_MANAGER",
  "QS",
  "FINANCE",
  "SUPPLIER",
  "CLIENT_VIEWER",
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: "ADMIN",
    name: "Administrator",
    description: "Full access across every module and security operation.",
    permissions: Array.from(new Set([...ALL_MODULE_PERMISSIONS])),
  },
  {
    key: "DIRECTOR",
    name: "Director",
    description: "Read access across the platform with approval authority.",
    permissions: Array.from(
      new Set([
        Permission.PROJECT_READ,
        Permission.QUOTE_READ,
        Permission.QUOTE_WRITE,
        Permission.QUOTE_APPROVE,
        Permission.CONTRACT_READ,
        Permission.CONTRACT_APPROVE,
        Permission.INVOICE_READ,
        Permission.INVOICE_WRITE,
        Permission.INVOICE_SEND,
        Permission.PAYMENT_RECORD,
        Permission.SUPPLIER_READ,
        Permission.SUBCONTRACT_READ,
        Permission.SUBCONTRACT_APPROVE,
        Permission.PM_UPDATE_READ,
        Permission.COMMS_READ,
        Permission.COMMS_WRITE,
        Permission.PNL_READ,
        Permission.AUDIT_READ,
        Permission.SETTINGS_READ,
        ...SECURITY_SELF_SERVICE,
      ]),
    ),
  },
  {
    key: "PROJECT_MANAGER",
    name: "Project Manager",
    description: "Operates projects, quotations, contracts, and collaboration.",
    permissions: Array.from(
      new Set([
        Permission.PROJECT_READ,
        Permission.PROJECT_WRITE,
        Permission.PROJECT_MEMBER_MANAGE,
        Permission.QUOTE_READ,
        Permission.QUOTE_WRITE,
        Permission.BOQ_READ,
        Permission.BOQ_WRITE,
        Permission.CONTRACT_READ,
        Permission.CONTRACT_WRITE,
        Permission.PM_UPDATE_READ,
        Permission.PM_UPDATE_WRITE,
        Permission.COMMS_READ,
        Permission.COMMS_WRITE,
        ...SECURITY_SELF_SERVICE,
      ]),
    ),
  },
  {
    key: "QS",
    name: "Quantity Surveyor",
    description: "Prepares and manages quotations and project commercial data.",
    permissions: Array.from(
      new Set([
        Permission.PROJECT_READ,
        Permission.QUOTE_READ,
        Permission.QUOTE_WRITE,
        Permission.BOQ_READ,
        Permission.BOQ_WRITE,
        Permission.BOQ_IMPORT,
        Permission.CONTRACT_READ,
        Permission.COMMS_READ,
        Permission.COMMS_WRITE,
        ...SECURITY_SELF_SERVICE,
      ]),
    ),
  },
  {
    key: "FINANCE",
    name: "Finance",
    description: "Handles contract finance controls, invoicing, and collections.",
    permissions: Array.from(
      new Set([
        Permission.PROJECT_READ,
        Permission.QUOTE_READ,
        Permission.CONTRACT_READ,
        Permission.CONTRACT_APPROVE,
        Permission.INVOICE_READ,
        Permission.INVOICE_WRITE,
        Permission.INVOICE_SEND,
        Permission.INVOICE_EXPORT_PDF,
        Permission.PAYMENT_RECORD,
        Permission.COMMS_READ,
        Permission.COMMS_WRITE,
        Permission.PNL_READ,
        Permission.AUDIT_READ,
        ...SECURITY_SELF_SERVICE,
      ]),
    ),
  },
  {
    key: "SUPPLIER",
    name: "Supplier",
    description: "Supplier-limited access to vendor and subcontract workflows.",
    permissions: Array.from(
      new Set([
        Permission.SUPPLIER_READ,
        Permission.SUBCONTRACT_READ,
        Permission.COMMS_READ,
        ...SECURITY_SELF_SERVICE,
      ]),
    ),
  },
  {
    key: "CLIENT_VIEWER",
    name: "Client Viewer",
    description: "Read-only visibility into client-facing project records.",
    permissions: Array.from(
      new Set([
        Permission.PROJECT_READ,
        Permission.QUOTE_READ,
        Permission.CONTRACT_READ,
        Permission.INVOICE_READ,
        Permission.PM_UPDATE_READ,
        Permission.COMMS_READ,
        ...SECURITY_SELF_SERVICE,
      ]),
    ),
  },
];

export function getPrimaryRoleKey(roleKeys: string[]): AppRoleKey | null {
  for (const roleKey of ROLE_PRIORITY) {
    if (roleKeys.includes(roleKey)) {
      return roleKey;
    }
  }

  return null;
}

export function getRoleLabel(roleKey: string | null | undefined): string {
  if (!roleKey) {
    return "User";
  }

  return ROLE_DEFINITIONS.find((role) => role.key === roleKey)?.name ?? roleKey;
}
