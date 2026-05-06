import "server-only";

import { ProposalStatus, Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type ProposalDecisionResult = {
  proposalId: string;
  status: ProposalStatus;
  message: string;
  approvalId: string | null;
  signatureId: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  signedAt: Date | null;
  alreadySigned: boolean;
};

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isSignatureDataUrl(value: string): boolean {
  return /^data:image\/(png|jpeg|jpg|svg\+xml);base64,[A-Za-z0-9+/=\n\r]+$/i.test(value.trim());
}

async function getRequestMetadata(): Promise<RequestMetadata> {
  try {
    const headerStore = await headers();
    return {
      ipAddress: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerStore.get("x-real-ip") ?? null,
      userAgent: headerStore.get("user-agent") ?? null,
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

async function getProposalByToken(token: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      publicToken: true,
      status: true,
      viewedAt: true,
    },
  });

  if (!proposal) throw new Error("Proposal link is invalid.");

  return proposal;
}

async function findLatestSignature(proposalId: string) {
  return prisma.proposalSignature.findFirst({
    where: { proposalId },
    orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      signedAt: true,
      signerName: true,
      signerEmail: true,
      signatureDataUrl: true,
    },
  });
}

async function createProposalSignature(
  tx: Prisma.TransactionClient,
  params: {
    proposalId: string;
    signerName: string;
    signerEmail: string;
    signatureDataUrl: string;
    ipAddress: string | null;
    userAgent: string | null;
    allowDuplicateSignature?: boolean;
    now: Date;
  },
) {
  const existingSignature = await tx.proposalSignature.findFirst({
    where: { proposalId: params.proposalId },
    orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, signedAt: true },
  });

  if (existingSignature && !params.allowDuplicateSignature) {
    return {
      created: false as const,
      signature: existingSignature,
    };
  }

  const signature = await tx.proposalSignature.create({
    data: {
      proposalId: params.proposalId,
      signerName: params.signerName,
      signerEmail: params.signerEmail,
      signatureDataUrl: params.signatureDataUrl.trim(),
      signedAt: params.now,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
    select: { id: true, signedAt: true },
  });

  return {
    created: true as const,
    signature,
  };
}

export async function markProposalViewedByToken(token: string) {
  const proposal = await getProposalByToken(token);

  if (proposal.status === ProposalStatus.APPROVED || proposal.status === ProposalStatus.REJECTED) {
    return proposal;
  }

  if (proposal.status === ProposalStatus.VIEWED && proposal.viewedAt) {
    return proposal;
  }

  return prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      status: ProposalStatus.VIEWED,
      viewedAt: proposal.viewedAt ?? new Date(),
    },
    select: {
      id: true,
      publicToken: true,
      status: true,
      viewedAt: true,
    },
  });
}

export async function approveProposalByToken(params: {
  token: string;
  clientName: string;
  clientEmail: string;
  comment?: string | null;
  signatureDataUrl: string;
  allowDuplicateSignature?: boolean;
}): Promise<ProposalDecisionResult> {
  const proposal = await getProposalByToken(params.token);
  const signerName = cleanText(params.clientName);
  const signerEmail = cleanText(params.clientEmail);

  if (!signerName) throw new Error("Full name is required.");
  if (!signerEmail) throw new Error("Email is required.");
  if (!isSignatureDataUrl(params.signatureDataUrl)) throw new Error("Please provide a valid signature.");

  const existingSignature = await findLatestSignature(proposal.id);
  if (existingSignature && !params.allowDuplicateSignature) {
    return {
      proposalId: proposal.id,
      status: ProposalStatus.APPROVED,
      message: "This proposal has already been approved and signed.",
      approvalId: null,
      signatureId: existingSignature.id,
      approvedAt: null,
      rejectedAt: null,
      signedAt: existingSignature.signedAt,
      alreadySigned: true,
    };
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const signatureResult = await createProposalSignature(tx, {
      proposalId: proposal.id,
      signerName,
      signerEmail: normalizeEmail(signerEmail),
      signatureDataUrl: params.signatureDataUrl,
      ipAddress,
      userAgent,
      allowDuplicateSignature: params.allowDuplicateSignature,
      now,
    });

    if (!signatureResult.created) {
      return {
        proposalId: proposal.id,
        status: ProposalStatus.APPROVED,
        message: "This proposal has already been approved and signed.",
        approvalId: null,
        signatureId: signatureResult.signature.id,
        approvedAt: null,
        rejectedAt: null,
        signedAt: signatureResult.signature.signedAt,
        alreadySigned: true,
      };
    }

    const approval = await tx.proposalApproval.create({
      data: {
        proposalId: proposal.id,
        clientName: signerName,
        clientEmail: normalizeEmail(signerEmail),
        status: ProposalStatus.APPROVED,
        comment: cleanText(params.comment),
        approvedAt: now,
        ipAddress,
        userAgent,
      },
      select: { id: true, approvedAt: true },
    });

    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        status: ProposalStatus.APPROVED,
        viewedAt: proposal.viewedAt ?? now,
      },
    });

    return {
      proposalId: proposal.id,
      status: ProposalStatus.APPROVED,
      message: "Proposal approved successfully. Your electronic signature has been recorded.",
      approvalId: approval.id,
      signatureId: signatureResult.signature.id,
      approvedAt: approval.approvedAt,
      rejectedAt: null,
      signedAt: signatureResult.signature.signedAt,
      alreadySigned: false,
    };
  });
}

export async function rejectProposalByToken(params: {
  token: string;
  clientName: string;
  clientEmail: string;
  comment: string;
}): Promise<ProposalDecisionResult> {
  const proposal = await getProposalByToken(params.token);
  const clientName = cleanText(params.clientName);
  const clientEmail = cleanText(params.clientEmail);
  const comment = cleanText(params.comment);

  if (!clientName) throw new Error("Full name is required.");
  if (!clientEmail) throw new Error("Email is required.");
  if (!comment) throw new Error("Please tell us what needs to change.");

  const existingSignature = await findLatestSignature(proposal.id);
  if (existingSignature) {
    throw new Error("This proposal has already been signed and cannot be rejected from this link.");
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const approval = await tx.proposalApproval.create({
      data: {
        proposalId: proposal.id,
        clientName,
        clientEmail: normalizeEmail(clientEmail),
        status: ProposalStatus.REJECTED,
        comment,
        rejectedAt: now,
        ipAddress,
        userAgent,
      },
      select: { id: true, rejectedAt: true },
    });

    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        status: ProposalStatus.REJECTED,
        viewedAt: proposal.viewedAt ?? now,
      },
    });

    return {
      proposalId: proposal.id,
      status: ProposalStatus.REJECTED,
      message: "Your requested changes have been recorded. Our team will review your comments.",
      approvalId: approval.id,
      signatureId: null,
      approvedAt: null,
      rejectedAt: approval.rejectedAt,
      signedAt: null,
      alreadySigned: false,
    };
  });
}

export async function signProposalByToken(params: {
  token: string;
  signerName: string;
  signerEmail: string;
  signatureDataUrl: string;
  allowDuplicateSignature?: boolean;
}): Promise<ProposalDecisionResult> {
  const proposal = await getProposalByToken(params.token);
  const signerName = cleanText(params.signerName);
  const signerEmail = cleanText(params.signerEmail);

  if (!signerName) throw new Error("Full name is required.");
  if (!signerEmail) throw new Error("Email is required.");
  if (!isSignatureDataUrl(params.signatureDataUrl)) throw new Error("Please provide a valid signature.");
  if (proposal.status !== ProposalStatus.APPROVED) {
    throw new Error("Approve the proposal before submitting a signature.");
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const signatureResult = await createProposalSignature(tx, {
      proposalId: proposal.id,
      signerName,
      signerEmail: normalizeEmail(signerEmail),
      signatureDataUrl: params.signatureDataUrl,
      ipAddress,
      userAgent,
      allowDuplicateSignature: params.allowDuplicateSignature,
      now,
    });

    if (!signatureResult.created) {
      return {
        proposalId: proposal.id,
        status: ProposalStatus.APPROVED,
        message: "This proposal already has a recorded signature.",
        approvalId: null,
        signatureId: signatureResult.signature.id,
        approvedAt: null,
        rejectedAt: null,
        signedAt: signatureResult.signature.signedAt,
        alreadySigned: true,
      };
    }

    return {
      proposalId: proposal.id,
      status: ProposalStatus.APPROVED,
      message: "Your signature has been recorded successfully.",
      approvalId: null,
      signatureId: signatureResult.signature.id,
      approvedAt: null,
      rejectedAt: null,
      signedAt: signatureResult.signature.signedAt,
      alreadySigned: false,
    };
  });
}
