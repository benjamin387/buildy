"use client";

import { useMemo } from "react";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { ActionButton } from "@/app/components/ui/action-button";

type ActionKey = "canView" | "canCreate" | "canEdit" | "canDelete" | "canApprove" | "canSend" | "canExport";

export type PermissionRuleLike = {
  moduleKey: PermissionModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canSend: boolean;
  canExport: boolean;
};

const ACTIONS: Array<{ key: ActionKey; label: string }> = [
  { key: "canView", label: "View" },
  { key: "canCreate", label: "Create" },
  { key: "canEdit", label: "Edit" },
  { key: "canDelete", label: "Delete" },
  { key: "canApprove", label: "Approve" },
  { key: "canSend", label: "Send" },
  { key: "canExport", label: "Export" },
];

function labelForModule(m: PermissionModuleKey): string {
  // Keep human readable without hardcoding too much.
  return String(m).replaceAll("_", " ").toLowerCase().replace(/(^|\s)\w/g, (x) => x.toUpperCase());
}

export function RolePermissionMatrix(props: {
  roleKey: string;
  modules: readonly PermissionModuleKey[];
  rules: PermissionRuleLike[];
}) {
  const byModule = useMemo(() => {
    const map = new Map<PermissionModuleKey, PermissionRuleLike>();
    for (const r of props.rules) {
      map.set(r.moduleKey, r);
    }
    return map;
  }, [props.rules]);

  function toggleModuleAll(moduleKey: PermissionModuleKey, enabled: boolean) {
    for (const a of ACTIONS) {
      const el = document.querySelector<HTMLInputElement>(`input[name="${moduleKey}__${a.key}"]`);
      if (el) el.checked = enabled;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-stone-50 px-4 py-3">
        <p className="text-sm font-semibold text-neutral-900">
          Role: <span className="font-mono text-xs">{props.roleKey}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => {
              for (const m of props.modules) toggleModuleAll(m, false);
            }}
          >
            Disable all
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => {
              for (const m of props.modules) toggleModuleAll(m, true);
            }}
          >
            Enable all
          </ActionButton>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-stone-50 text-neutral-800">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold">Module</th>
              {ACTIONS.map((a) => (
                <th key={a.key} className="px-3 py-3 text-center font-semibold">
                  {a.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold">Bulk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {props.modules.map((m) => {
              const rule = byModule.get(m) ?? null;
              return (
                <tr key={m}>
                  <td className="px-4 py-3 font-semibold text-neutral-950">{labelForModule(m)}</td>
                  {ACTIONS.map((a) => (
                    <td key={a.key} className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        name={`${m}__${a.key}`}
                        defaultChecked={Boolean(rule?.[a.key])}
                        className="h-4 w-4 accent-neutral-900"
                        aria-label={`${labelForModule(m)} ${a.label}`}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <ActionButton type="button" variant="secondary" size="sm" onClick={() => toggleModuleAll(m, true)}>
                        All
                      </ActionButton>
                      <ActionButton type="button" variant="secondary" size="sm" onClick={() => toggleModuleAll(m, false)}>
                        None
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
