"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CompanyLogo } from "@/app/components/ui/company-logo";

const ACCEPTED_FILE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function revokeBlobUrl(value: string | null) {
  if (value?.startsWith("blob:")) {
    URL.revokeObjectURL(value);
  }
}

export function LogoUploadField(props: {
  companyName: string;
  currentLogoUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => revokeBlobUrl(selectedPreviewUrl);
  }, [selectedPreviewUrl]);

  useEffect(() => {
    revokeBlobUrl(selectedPreviewUrl);
    setSelectedPreviewUrl(null);
    setSelectedFileName(null);
    setRemoveLogo(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    // This resets the client preview whenever the saved logo changes after a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.currentLogoUrl]);

  const previewUrl = removeLogo ? null : selectedPreviewUrl ?? props.currentLogoUrl;

  function updateSelectedPreview(nextValue: string | null) {
    setSelectedPreviewUrl((previousValue) => {
      revokeBlobUrl(previousValue);
      return nextValue;
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      updateSelectedPreview(null);
      setSelectedFileName(null);
      setError(null);
      return;
    }

    if (!ACCEPTED_FILE_TYPES.includes(file.type as (typeof ACCEPTED_FILE_TYPES)[number])) {
      event.target.value = "";
      updateSelectedPreview(null);
      setSelectedFileName(null);
      setError("Please upload a PNG, JPG, or WebP logo.");
      return;
    }

    setRemoveLogo(false);
    setError(null);
    setSelectedFileName(file.name);
    updateSelectedPreview(URL.createObjectURL(file));
  }

  function clearSelection(removeExisting: boolean) {
    if (inputRef.current) inputRef.current.value = "";
    updateSelectedPreview(null);
    setSelectedFileName(null);
    setError(null);
    setRemoveLogo(removeExisting);
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="removeLogo" value={removeLogo ? "1" : "0"} />

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-stone-50 p-4 sm:flex-row sm:items-center">
        <CompanyLogo
          src={previewUrl}
          companyName={props.companyName}
          alt={`${props.companyName} logo preview`}
          className="h-20 w-20 shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          fallbackClassName="rounded-2xl"
          fallbackMode="initial"
          fallbackTextClassName="text-lg"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Logo Preview</p>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              PNG, JPG, or WebP only. Files are stored locally under <code>/public/uploads/logos</code>.
            </p>
          </div>
          <p className="truncate text-xs font-medium text-neutral-600">
            {selectedFileName
              ? `Selected: ${selectedFileName}`
              : previewUrl
                ? "Current company logo"
                : "No logo uploaded yet"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {selectedFileName ? (
            <button
              type="button"
              onClick={() => clearSelection(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              Clear selection
            </button>
          ) : null}
          {!selectedFileName && previewUrl && !removeLogo ? (
            <button
              type="button"
              onClick={() => clearSelection(Boolean(props.currentLogoUrl))}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              Remove
            </button>
          ) : null}
          {removeLogo && props.currentLogoUrl ? (
            <button
              type="button"
              onClick={() => clearSelection(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              Restore
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        name="logoFile"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-neutral-950 shadow-sm file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      />

      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
