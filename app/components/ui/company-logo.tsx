"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getCompanyInitial(companyName: string): string {
  const value = companyName.trim();
  return value.charAt(0).toUpperCase() || "B";
}

export function CompanyLogo(props: {
  src?: string | null;
  companyName: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  fallbackTextClassName?: string;
  fallbackLabel?: string;
  fallbackMode?: "initial" | "name";
}) {
  const normalizedSrc = props.src?.trim() ? props.src.trim() : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasFailed = Boolean(normalizedSrc && failedSrc === normalizedSrc);

  const fallbackLabel =
    props.fallbackLabel ??
    (props.fallbackMode === "name" ? props.companyName : getCompanyInitial(props.companyName));

  return (
    <div className={cx("inline-flex items-center justify-center overflow-hidden", props.className)}>
      {normalizedSrc && !hasFailed ? (
        <img
          src={normalizedSrc}
          alt={props.alt ?? props.companyName}
          className={cx("h-full w-full object-contain", props.imageClassName)}
          onError={() => setFailedSrc(normalizedSrc)}
        />
      ) : (
        <span
          className={cx(
            "inline-flex h-full w-full items-center justify-center bg-neutral-950 text-white",
            props.fallbackClassName,
          )}
        >
          <span className={cx("truncate font-semibold leading-none", props.fallbackTextClassName)}>
            {fallbackLabel}
          </span>
        </span>
      )}
    </div>
  );
}
