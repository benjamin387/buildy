import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary";
type Size = "sm" | "md";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function LinkButton(props: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  const variant = props.variant ?? "primary";
  const size = props.size ?? "md";

  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";

  const sizeClass = size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-sm";

  const variantClass =
    variant === "primary"
      ? "bg-neutral-950 text-white shadow-sm hover:bg-neutral-900"
      : "border border-slate-200 bg-white text-neutral-900 shadow-sm hover:bg-neutral-50";

  return (
    <Link
      href={props.href}
      className={cx(base, sizeClass, variantClass, props.className)}
    >
      {props.children}
    </Link>
  );
}
