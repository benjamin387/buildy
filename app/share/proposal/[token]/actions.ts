"use server";

import { ProposalStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { approveProposalByToken, rejectProposalByToken, signProposalByToken } from "@/lib/proposals/approval";

export type ProposalPublicActionResult = {
  success: boolean;
  status?: ProposalStatus;
  message?: string;
  error?: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  signedAt?: string | null;
  alreadySigned?: boolean;
};

const baseSchema = z.object({
  token: z.string().min(20),
  clientName: z.string().trim().min(1, "Full name is required."),
  clientEmail: z.string().trim().email("Enter a valid email address."),
});

const approveSchema = baseSchema.extend({
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
  signatureDataUrl: z.string().trim().min(1, "Please provide a signature."),
});

const rejectSchema = baseSchema.extend({
  comment: z.string().trim().min(1, "Please tell us what needs to change.").max(2000),
});

const signSchema = baseSchema.extend({
  signatureDataUrl: z.string().trim().min(1, "Please provide a signature."),
});

function serializeResult(result: {
  status: ProposalStatus;
  message: string;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  signedAt: Date | null;
  alreadySigned: boolean;
}): ProposalPublicActionResult {
  return {
    success: true,
    status: result.status,
    message: result.message,
    approvedAt: result.approvedAt?.toISOString() ?? null,
    rejectedAt: result.rejectedAt?.toISOString() ?? null,
    signedAt: result.signedAt?.toISOString() ?? null,
    alreadySigned: result.alreadySigned,
  };
}

function mutationPaths(token: string, proposalId: string) {
  return [`/share/proposal/${token}`, `/proposals/${proposalId}`];
}

export async function approveProposal(input: z.infer<typeof approveSchema>): Promise<ProposalPublicActionResult> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid approval request." };
  }

  try {
    const result = await approveProposalByToken(parsed.data);
    for (const path of mutationPaths(parsed.data.token, result.proposalId)) revalidatePath(path);
    return serializeResult(result);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to approve this proposal right now.",
    };
  }
}

export async function rejectProposal(input: z.infer<typeof rejectSchema>): Promise<ProposalPublicActionResult> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid rejection request." };
  }

  try {
    const result = await rejectProposalByToken(parsed.data);
    for (const path of mutationPaths(parsed.data.token, result.proposalId)) revalidatePath(path);
    return serializeResult(result);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to submit your change request right now.",
    };
  }
}

export async function signProposal(input: z.infer<typeof signSchema>): Promise<ProposalPublicActionResult> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid signature request." };
  }

  try {
    const result = await signProposalByToken({
      token: parsed.data.token,
      signerName: parsed.data.clientName,
      signerEmail: parsed.data.clientEmail,
      signatureDataUrl: parsed.data.signatureDataUrl,
    });
    for (const path of mutationPaths(parsed.data.token, result.proposalId)) revalidatePath(path);
    return serializeResult(result);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to record the signature right now.",
    };
  }
}
