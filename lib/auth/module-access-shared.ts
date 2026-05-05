import type { ModuleAccessKey } from "@/lib/auth/module-access-keys";

export type ModuleAccessFlags = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type ModuleAccessMatrix = Record<ModuleAccessKey, ModuleAccessFlags>;

export type CurrentUserAccess = {
  isAdmin: boolean;
  matrix: ModuleAccessMatrix;
};
