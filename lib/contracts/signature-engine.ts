import "server-only";

import { ContractStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export type ContractSignatureStatusResult = {
  contractId: string;
  contractNumber: string;
  contractStatus: ContractStatus;
  signatureStatus: string;
  signedAt: Date | null;
  canSign: boolean;
  hasSignature: boolean;
};

type PortalTokenWithAccount = {
  id: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  accountId: string;
  account: {
    id: string;
    isActive: boolean;
    projectId: string | null;
    clientId: string | null;
    name: string;
    email: string;
    phone: string | null;
  };
};

function isDataUrl(value: string): boolean {
  return /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=\n\r]+$/i.test(value.trim());
}

function getIpUserAgent(h: Headers) {
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  return { ipAddress, userAgent };
}

async function getActivePortalAccessByToken(token: string): Promise<PortalTokenWithAccount> {
  const row = await prisma.clientPortalToken.findUnique({
    where: { token },
    include: {
      account: {
        select: {
          id: true,
          isActive: true,
          projectId: true,
          clientId: true,
          name: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  if (!row || !row.account.isActive) throw new Error("Access link is invalid.");
  if (row.expiresAt.getTime() < Date.now()) throw new Error("Access link has expired.");
  return row as PortalTokenWithAccount;
}

async function resolveContractForPortal(access: PortalTokenWithAccount) {
  if (access.account.projectId) {
    const contract = await prisma.contract.findFirst({
      where: { projectId: access.account.projectId },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, projectId: true, contractNumber: true, status: true, signedAt: true },
    });
    if (contract) return contract;
  }

  if (access.account.clientId) {
    const contract = await prisma.contract.findFirst({
      where: { project: { clientId: access.account.clientId } },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, projectId: true, contractNumber: true, status: true, signedAt: true },
    });
    if (contract) return contract;
  }

  throw new Error("No contract found for this client portal access.");
}

export async function getContractSignatureStatus(params: { token: string }): Promise<ContractSignatureStatusResult> {
  const access = await getActivePortalAccessByToken(params.token);
  const contract = await resolveContractForPortal(access);

  const signature = await prisma.contractSignature.findUnique({
    where: {
      contractId_clientPortalAccessId: {
        contractId: contract.id,
        clientPortalAccessId: access.id,
      },
    },
    select: { status: true, signedAt: true },
  });

  const hasSignature = Boolean(signature);
  const signatureStatus = signature?.status ?? "PENDING";
  const canSign = signatureStatus !== "SIGNED" && contract.status !== "SIGNED";

  return {
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    contractStatus: contract.status,
    signatureStatus,
    signedAt: signature?.signedAt ?? null,
    canSign,
    hasSignature,
  };
}

export async function createContractSignature(params: {
  token: string;
  signerName: string;
  signerEmail: string;
  signerPhone?: string | null;
  signatureDataUrl: string;
  acceptedTerms: boolean;
}) {
  const access = await getActivePortalAccessByToken(params.token);
  const contract = await resolveContractForPortal(access);

  if (!params.acceptedTerms) throw new Error("You must accept the contract terms before signing.");
  if (!isDataUrl(params.signatureDataUrl)) throw new Error("Invalid signature format.");

  const existingSigned = await prisma.contractSignature.findUnique({
    where: {
      contractId_clientPortalAccessId: {
        contractId: contract.id,
        clientPortalAccessId: access.id,
      },
    },
  });

  if (existingSigned?.status === "SIGNED") {
    throw new Error("This contract has already been signed from this access link.");
  }

  const h = await headers();
  const { ipAddress, userAgent } = getIpUserAgent(h);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const signature = await tx.contractSignature.upsert({
      where: {
        contractId_clientPortalAccessId: {
          contractId: contract.id,
          clientPortalAccessId: access.id,
        },
      },
      create: {
        contractId: contract.id,
        clientPortalAccessId: access.id,
        signerName: params.signerName.trim(),
        signerEmail: params.signerEmail.trim().toLowerCase(),
        signerPhone: params.signerPhone?.trim() || null,
        signatureDataUrl: params.signatureDataUrl.trim(),
        signedIpAddress: ipAddress,
        signedUserAgent: userAgent,
        signedAt: now,
        status: "SIGNED",
      },
      update: {
        signerName: params.signerName.trim(),
        signerEmail: params.signerEmail.trim().toLowerCase(),
        signerPhone: params.signerPhone?.trim() || null,
        signatureDataUrl: params.signatureDataUrl.trim(),
        signedIpAddress: ipAddress,
        signedUserAgent: userAgent,
        signedAt: now,
        status: "SIGNED",
      },
    });

    await tx.contractApprovalLog.create({
      data: {
        contractId: contract.id,
        clientPortalAccessId: access.id,
        action: "SIGNED",
        comment: "Client completed e-signature.",
        ipAddress,
        userAgent,
        createdAt: now,
      },
    });

    await tx.contract.update({
      where: { id: contract.id },
      data: { status: "SIGNED", signedAt: now, lockedAt: now },
    });

    await tx.project.update({
      where: { id: contract.projectId },
      data: { contractStatus: "SIGNED" },
    });

    return signature;
  });

  return { success: true, signatureId: result.id, signedAt: result.signedAt };
}

export async function approveContract(params: { contractId: string; comment?: string | null; clientPortalAccessId?: string | null }) {
  const h = await headers();
  const { ipAddress, userAgent } = getIpUserAgent(h);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: params.contractId },
      data: { status: "SIGNED", signedAt: now, lockedAt: now },
    });

    const contract = await tx.contract.findUnique({ where: { id: params.contractId }, select: { projectId: true } });
    if (contract) {
      await tx.project.update({ where: { id: contract.projectId }, data: { contractStatus: "SIGNED" } });
    }

    await tx.contractApprovalLog.create({
      data: {
        contractId: params.contractId,
        clientPortalAccessId: params.clientPortalAccessId ?? null,
        action: "APPROVED",
        comment: params.comment?.trim() || null,
        ipAddress,
        userAgent,
      },
    });
  });

  return { success: true };
}

export async function rejectContract(params: { contractId: string; comment?: string | null; clientPortalAccessId?: string | null }) {
  const h = await headers();
  const { ipAddress, userAgent } = getIpUserAgent(h);

  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: params.contractId },
      data: { status: "REJECTED" },
    });

    const contract = await tx.contract.findUnique({ where: { id: params.contractId }, select: { projectId: true } });
    if (contract) {
      await tx.project.update({ where: { id: contract.projectId }, data: { contractStatus: "REJECTED" } });
    }

    await tx.contractApprovalLog.create({
      data: {
        contractId: params.contractId,
        clientPortalAccessId: params.clientPortalAccessId ?? null,
        action: "REJECTED",
        comment: params.comment?.trim() || null,
        ipAddress,
        userAgent,
      },
    });
  });

  return { success: true };
}

function buildSimplePdf(lines: string[]): Uint8Array {
  const text = lines.join("\\n").replace(/[()\\]/g, "");
  const content = `BT /F1 12 Tf 50 780 Td (${text.split("\\n").join(") Tj T* (")}) Tj ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export async function downloadSignedContractPdf(params: { contractId: string }) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.contractId },
    include: {
      contractSignatures: { orderBy: [{ signedAt: "desc" }] },
      project: { select: { name: true } },
    },
  });

  if (!contract) throw new Error("Contract not found.");

  const latestSig = contract.contractSignatures.find((s) => s.status === "SIGNED") ?? null;

  const payload = buildSimplePdf([
    `Buildy Signed Contract`,
    `Contract: ${contract.contractNumber}`,
    `Project: ${contract.project?.name ?? "-"}`,
    `Status: ${contract.status}`,
    `Contract Value: ${contract.totalAmount.toString()}`,
    `Signed By: ${latestSig?.signerName ?? "-"}`,
    `Signer Email: ${latestSig?.signerEmail ?? "-"}`,
    `Signed At: ${latestSig?.signedAt?.toISOString() ?? "-"}`,
    `Generated At: ${new Date().toISOString()}`,
  ]);

  return {
    fileName: `${contract.contractNumber}-signed.pdf`,
    bytes: payload,
  };
}
