"use client";

import * as React from "react";

export function CopyLinkButton(props: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const label = props.label ?? "Copy link";

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(props.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Best-effort. If clipboard fails (permissions), do nothing.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={
        props.className ??
        "inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-neutral-200"
      }
      aria-label={label}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

