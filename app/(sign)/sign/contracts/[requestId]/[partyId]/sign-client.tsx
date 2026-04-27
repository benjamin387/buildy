"use client";

import { useEffect, useMemo, useState } from "react";

type ApiResponse = { success: boolean; error?: string; data?: unknown };

export function ContractSigningClient(props: {
  requestId: string;
  partyId: string;
  partyName: string;
  partyEmail: string;
  initialStatus: string;
  expiresAt: string | null;
  contractNumber: string;
}) {
  const [status, setStatus] = useState(props.initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signedName, setSignedName] = useState(props.partyName);

  const isExpired = useMemo(() => {
    if (!props.expiresAt) return false;
    return Date.now() > new Date(props.expiresAt).getTime();
  }, [props.expiresAt]);

  useEffect(() => {
    let cancelled = false;
    async function markViewed() {
      try {
        await fetch(`/api/signature-requests/${props.requestId}/parties/${props.partyId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "viewed" }),
        });
      } catch {
        // ignore - portal remains usable
      }
    }
    markViewed().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [props.requestId, props.partyId]);

  async function submit(action: "signed" | "rejected") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/signature-requests/${props.requestId}/parties/${props.partyId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "signed" ? { action, signedName } : { action },
          ),
        },
      );
      const payload = (await res.json()) as ApiResponse;
      if (!payload.success) throw new Error(payload.error || "Failed");
      setStatus(action === "signed" ? "SIGNED" : "REJECTED");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Contract Signing
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            {props.contractNumber}
          </h1>
          <p className="mt-2 text-sm text-neutral-700">
            Signing as <span className="font-semibold">{props.partyEmail}</span> · Status{" "}
            <span className="font-semibold">{status}</span>
          </p>
          {isExpired ? (
            <p className="mt-2 text-sm font-semibold text-red-700">This request has expired.</p>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-2 text-sm sm:col-span-2">
          <span className="font-medium text-neutral-800">Signer Name</span>
          <input
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            placeholder="Full name"
          />
        </label>

        <div className="flex items-end justify-end gap-2">
          <button
            type="button"
            disabled={loading || isExpired || status === "SIGNED" || status === "REJECTED"}
            onClick={() => {
              if (!confirm("Sign this contract?")) return;
              submit("signed");
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Working..." : "Sign"}
          </button>
          <button
            type="button"
            disabled={loading || isExpired || status === "SIGNED" || status === "REJECTED"}
            onClick={() => {
              if (!confirm("Reject this contract?")) return;
              submit("rejected");
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      </div>

      <p className="mt-6 text-xs leading-5 text-neutral-500">
        By signing, you confirm acceptance of the contract terms and scope. If you are not the next
        signer in the sequence, the system will prevent signing until prior parties have signed.
      </p>
    </section>
  );
}
