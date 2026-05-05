"use client";

import { useState } from "react";
import { SignaturePad } from "@/app/client/[token]/contract/sign/signature-pad";

type SignResponse = { success: boolean; error?: string };

export function ContractPortalSignClient(props: {
  token: string;
  contractNumber: string;
  contractStatus: string;
  initialSignerName: string;
  initialSignerEmail: string;
  initialSignerPhone: string;
  canSign: boolean;
}) {
  const [signerName, setSignerName] = useState(props.initialSignerName);
  const [signerEmail, setSignerEmail] = useState(props.initialSignerEmail);
  const [signerPhone, setSignerPhone] = useState(props.initialSignerPhone);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setError("");

    if (!props.canSign) {
      setError("This contract has already been signed or cannot be signed from this link.");
      return;
    }
    if (!signerName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!signerEmail.trim()) {
      setError("Email is required.");
      return;
    }
    if (!signatureDataUrl) {
      setError("Please draw your signature.");
      return;
    }
    if (!accepted) {
      setError("You must accept the contract terms before signing.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/client/contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: props.token,
          signerName,
          signerEmail,
          signerPhone,
          signatureDataUrl,
          acceptedTerms: accepted,
        }),
      });

      const payload = (await res.json()) as SignResponse;
      if (!payload.success) throw new Error(payload.error || "Failed to sign contract.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign contract.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Review & Sign</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Contract {props.contractNumber}</h1>
      <p className="mt-2 text-sm text-slate-600">Current status: <span className="font-semibold text-slate-900">{props.contractStatus}</span></p>

      {done ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Contract signed successfully. Your signature has been recorded with timestamp and audit metadata.
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium text-slate-800">Full Name</span>
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 outline-none ring-slate-400 focus:ring-2"
            placeholder="As per NRIC / legal name"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium text-slate-800">Email</span>
          <input
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 outline-none ring-slate-400 focus:ring-2"
            type="email"
          />
        </label>
        <label className="grid gap-2 text-sm sm:col-span-2">
          <span className="font-medium text-slate-800">Phone (optional)</span>
          <input
            value={signerPhone}
            onChange={(e) => setSignerPhone(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 outline-none ring-slate-400 focus:ring-2"
          />
        </label>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-slate-800">Signature</p>
        <SignaturePad onChange={setSignatureDataUrl} />
      </div>

      <label className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>
          I have reviewed and agree to the contract terms, scope, price, and timeline. I consent to electronic signing.
        </span>
      </label>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={loading || done || !props.canSign}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing..." : "Confirm & Sign"}
        </button>
      </div>
    </section>
  );
}
