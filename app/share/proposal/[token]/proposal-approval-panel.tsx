"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { ProposalStatus } from "@prisma/client";
import { ProposalSignatureField } from "@/app/components/proposal/proposal-signature-field";
import { StatusPill } from "@/app/components/ui/status-pill";
import { approveProposal, rejectProposal, signProposal, type ProposalPublicActionResult } from "@/app/share/proposal/[token]/actions";

type DecisionSnapshot = {
  clientName: string;
  clientEmail: string;
  status: ProposalStatus;
  comment: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
} | null;

type SignatureSnapshot = {
  signerName: string;
  signerEmail: string;
  signatureDataUrl: string;
  signedAt: string;
} | null;

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: ProposalStatus) {
  if (status === ProposalStatus.APPROVED) return "success";
  if (status === ProposalStatus.REJECTED) return "danger";
  if (status === ProposalStatus.VIEWED) return "info";
  if (status === ProposalStatus.SENT) return "warning";
  return "neutral";
}

export function ProposalApprovalPanel(props: {
  token: string;
  proposalTitle: string;
  initialStatus: ProposalStatus;
  initialClientName: string;
  initialDecision: DecisionSnapshot;
  initialSignature: SignatureSnapshot;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(props.initialStatus);
  const [clientName, setClientName] = useState(props.initialDecision?.clientName ?? props.initialClientName);
  const [clientEmail, setClientEmail] = useState(props.initialDecision?.clientEmail ?? props.initialSignature?.signerEmail ?? "");
  const [comment, setComment] = useState(props.initialDecision?.comment ?? "");
  const [typedSignatureName, setTypedSignatureName] = useState(props.initialSignature?.signerName ?? props.initialDecision?.clientName ?? props.initialClientName);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [decision, setDecision] = useState<DecisionSnapshot>(props.initialDecision);
  const [recordedSignature, setRecordedSignature] = useState<SignatureSnapshot>(props.initialSignature);
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");

  const proposalLocked = Boolean(recordedSignature);
  const requiresSignatureOnly = status === ProposalStatus.APPROVED && !recordedSignature;
  const canReject = !proposalLocked;

  async function runMutation(
    action:
      | (() => Promise<ProposalPublicActionResult>)
      | null,
    onSuccess: (result: ProposalPublicActionResult) => void,
  ) {
    if (!action) return;
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Unable to process your request.");
        return;
      }

      setStatus(result.status ?? status);
      setNotice(result.message ?? "Your response has been recorded.");
      onSuccess(result);
    });
  }

  function submitApprove() {
    if (!signatureDataUrl) {
      setError("Please draw or type your signature before approving.");
      return;
    }

    void runMutation(
      () =>
        approveProposal({
          token: props.token,
          clientName,
          clientEmail,
          comment,
          signatureDataUrl,
        }),
      (result) => {
        setDecision({
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          status: ProposalStatus.APPROVED,
          comment: comment.trim() || null,
          approvedAt: result.approvedAt ?? new Date().toISOString(),
          rejectedAt: null,
        });
        setRecordedSignature((current) =>
          result.alreadySigned
            ? current ?? {
                signerName: clientName.trim(),
                signerEmail: clientEmail.trim(),
                signatureDataUrl,
                signedAt: result.signedAt ?? new Date().toISOString(),
              }
            : {
                signerName: clientName.trim(),
                signerEmail: clientEmail.trim(),
                signatureDataUrl,
                signedAt: result.signedAt ?? new Date().toISOString(),
              },
        );
      },
    );
  }

  function submitSignature() {
    if (!signatureDataUrl) {
      setError("Please draw or type your signature before submitting.");
      return;
    }

    void runMutation(
      () =>
        signProposal({
          token: props.token,
          clientName,
          clientEmail,
          signatureDataUrl,
        }),
      (result) => {
        setRecordedSignature((current) =>
          result.alreadySigned
            ? current ?? {
                signerName: clientName.trim(),
                signerEmail: clientEmail.trim(),
                signatureDataUrl,
                signedAt: result.signedAt ?? new Date().toISOString(),
              }
            : {
                signerName: clientName.trim(),
                signerEmail: clientEmail.trim(),
                signatureDataUrl,
                signedAt: result.signedAt ?? new Date().toISOString(),
              },
        );
      },
    );
  }

  function submitReject() {
    void runMutation(
      () =>
        rejectProposal({
          token: props.token,
          clientName,
          clientEmail,
          comment,
        }),
      (result) => {
        setDecision({
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          status: ProposalStatus.REJECTED,
          comment: comment.trim() || null,
          approvedAt: null,
          rejectedAt: result.rejectedAt ?? new Date().toISOString(),
        });
        setRecordedSignature(null);
      },
    );
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_18px_40px_rgba(16,24,40,0.08)]">
      <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.98)_0%,rgba(68,64,60,0.94)_100%)] px-6 py-7 text-white sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Client Approval</p>
          <StatusPill tone={statusTone(status)} className="border-white/15 bg-white/10 text-white">
            {status}
          </StatusPill>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{props.proposalTitle}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/80">
          Review the proposal details, confirm the direction, and sign electronically to move the quotation forward.
        </p>
      </div>

      <div className="grid gap-8 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <div className="space-y-5">
          {notice ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Full Name</span>
              <input
                value={clientName}
                disabled={isPending || proposalLocked}
                onChange={(event) => {
                  setClientName(event.target.value);
                  if (!typedSignatureName.trim()) setTypedSignatureName(event.target.value);
                }}
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-neutral-950 outline-none ring-slate-400 transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Your legal name"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Email</span>
              <input
                value={clientEmail}
                disabled={isPending || proposalLocked}
                onChange={(event) => setClientEmail(event.target.value)}
                type="email"
                className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-neutral-950 outline-none ring-slate-400 transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="name@company.com"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">
              {status === ProposalStatus.REJECTED ? "Requested changes" : "Comments or requested changes"}
            </span>
            <textarea
              value={comment}
              disabled={isPending || proposalLocked}
              onChange={(event) => setComment(event.target.value)}
              rows={5}
              className="rounded-[24px] border border-slate-300 bg-white px-4 py-3 text-neutral-950 outline-none ring-slate-400 transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Share any clarifications, requested refinements, or implementation notes."
            />
          </label>

          {!proposalLocked ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-neutral-800">Electronic signature</p>
                <p className="mt-1 text-sm text-neutral-600">
                  A signature is required for approval. For change requests, comments alone are enough.
                </p>
              </div>
              <ProposalSignatureField
                typedName={typedSignatureName}
                onTypedNameChange={setTypedSignatureName}
                onChange={setSignatureDataUrl}
                disabled={isPending}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            {requiresSignatureOnly ? (
              <button
                type="button"
                onClick={submitSignature}
                disabled={isPending}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Submitting..." : "Submit Signature"}
              </button>
            ) : (
              <button
                type="button"
                onClick={submitApprove}
                disabled={isPending || proposalLocked}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Submitting..." : "Approve & Sign"}
              </button>
            )}

            {canReject ? (
              <button
                type="button"
                onClick={submitReject}
                disabled={isPending}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-neutral-900 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Submitting..." : "Request Changes"}
              </button>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[24px] border border-slate-200 bg-stone-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Current response</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Status</p>
                <p className="mt-1 text-sm font-semibold text-neutral-950">{status}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Decision maker</p>
                <p className="mt-1 text-sm font-semibold text-neutral-950">
                  {decision?.clientName || clientName.trim() || "Pending client response"}
                </p>
                <p className="mt-1 text-sm text-neutral-600">{decision?.clientEmail || clientEmail.trim() || "No email captured yet"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Recorded at</p>
                <p className="mt-1 text-sm font-semibold text-neutral-950">
                  {formatDateTime(decision?.approvedAt ?? decision?.rejectedAt ?? recordedSignature?.signedAt ?? null) ?? "Awaiting submission"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Signature record</p>
            {recordedSignature ? (
              <div className="mt-4 space-y-4">
                <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                  <Image
                    src={recordedSignature.signatureDataUrl}
                    alt={`Signature of ${recordedSignature.signerName}`}
                    width={900}
                    height={280}
                    unoptimized
                    className="h-auto w-full"
                  />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-stone-50 px-4 py-3 text-sm text-neutral-700">
                  <p className="font-semibold text-neutral-950">{recordedSignature.signerName}</p>
                  <p className="mt-1">{recordedSignature.signerEmail}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-neutral-500">
                    Signed {formatDateTime(recordedSignature.signedAt) ?? "just now"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-7 text-neutral-600">
                No signature has been recorded yet. Approving the proposal will store the signature together with timestamp, IP address, and browser details.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
