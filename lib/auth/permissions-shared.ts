import type { PermissionModuleKey } from "@/lib/auth/permission-keys";

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "send"
  | "export";

export type ModulePermission = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canSend: boolean;
  canExport: boolean;
};

export type PermissionMatrix = Record<PermissionModuleKey, ModulePermission>;

export const EMPTY_PERMISSION: ModulePermission = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canSend: false,
  canExport: false,
};

export function can(matrix: PermissionMatrix, moduleKey: PermissionModuleKey, action: PermissionAction): boolean {
  const mod = matrix[moduleKey] ?? EMPTY_PERMISSION;
  if (action === "view") return Boolean(mod.canView);
  if (action === "create") return Boolean(mod.canCreate);
  if (action === "edit") return Boolean(mod.canEdit);
  if (action === "delete") return Boolean(mod.canDelete);
  if (action === "approve") return Boolean(mod.canApprove);
  if (action === "send") return Boolean(mod.canSend);
  if (action === "export") return Boolean(mod.canExport);
  return false;
}
