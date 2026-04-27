"use client";

import { useState } from "react";

type Status =
  | "DRAFT"
  | "PREPARED"
  | "CALCULATED"
  | "SENT"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export function QuotationStatusActions(props: {
  projectId: string;
  quotationId: string;
  status: Status;
  canWrite: boolean;
  canApprove: boolean;
  isLatest: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function updateStatus(nextStatus: "SENT" | "APPROVED" | "REJECTED") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/projects/${props.projectId}/quotations/${props.quotationId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      const payload = (await res.json()) as { success: boolean; error?: string };
      if (!payload.success) throw new Error(payload.error || "Failed to update status");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setLoading(false);
    }
  }

  const canSend =
    props.isLatest &&
    props.canWrite &&
    (props.status === "DRAFT" || props.status === "PREPARED" || props.status === "CALCULATED");
  const canDecide = props.isLatest && props.canApprove && props.status === "SENT";

  return (
    <div className="grid gap-2">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {canSend ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => updateStatus("SENT")}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Working..." : "Mark as Sent"}
          </button>
        ) : null}

        {canDecide ? (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                if (!confirm("Approve this quotation? This locks it for downstream stages.")) return;
                updateStatus("APPROVED");
              }}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                if (!confirm("Reject this quotation?")) return;
                updateStatus("REJECTED");
              }}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reject
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

