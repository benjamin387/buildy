"use client";

import { signOutAction } from "@/app/(platform)/actions/sign-out";
import { LogOut } from "lucide-react";

export function SignOutButton(props?: { className?: string; variant?: "full" | "icon"; label?: string }) {
  const variant = props?.variant ?? "full";
  const label = props?.label ?? "Sign out";
  return (
    <form action={signOutAction}>
      <button
        className={
          props?.className ??
          "inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
        }
        type="submit"
        aria-label={label}
      >
        {variant === "icon" ? <LogOut className="h-4 w-4" /> : <span className="inline-flex items-center gap-2"><LogOut className="h-4 w-4" />{label}</span>}
      </button>
    </form>
  );
}
