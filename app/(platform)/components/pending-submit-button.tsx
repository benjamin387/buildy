"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function PendingSubmitButton(props: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        props.className ??
        "inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {pending ? props.pendingText ?? "Working..." : props.children}
    </button>
  );
}
