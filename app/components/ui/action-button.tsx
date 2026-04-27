import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function ActionButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
  },
) {
  const variant = props.variant ?? "primary";
  const size = props.size ?? "md";

  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-60";

  const sizeClass =
    size === "sm"
      ? "h-9 px-3 text-sm"
      : size === "lg"
        ? "h-12 px-5 text-sm"
        : "h-11 px-4 text-sm";

  const variantClass =
    variant === "primary"
      ? "bg-neutral-950 text-white shadow-sm hover:bg-neutral-900"
      : variant === "danger"
        ? "bg-red-600 text-white shadow-sm hover:bg-red-700"
        : variant === "ghost"
          ? "bg-transparent text-neutral-900 hover:bg-neutral-100"
          : "border border-slate-200 bg-white text-neutral-900 shadow-sm hover:bg-neutral-50";

  const { leftIcon, rightIcon, className, children, ...rest } = props;

  return (
    <button className={cx(base, sizeClass, variantClass, className)} {...rest}>
      {leftIcon ? <span className="inline-flex">{leftIcon}</span> : null}
      <span className="min-w-0">{children}</span>
      {rightIcon ? <span className="inline-flex">{rightIcon}</span> : null}
    </button>
  );
}

