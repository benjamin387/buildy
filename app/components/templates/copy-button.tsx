"use client";

import { useState } from "react";
import { ActionButton } from "@/app/components/ui/action-button";

export function TemplateCopyButton(props: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <ActionButton type="button" variant="secondary" onClick={onCopy}>
      {copied ? "Copied" : props.label ?? "Copy"}
    </ActionButton>
  );
}

