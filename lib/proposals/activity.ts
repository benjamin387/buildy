import "server-only";

import { ProposalActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp } from "@/lib/messaging/whatsapp";
import { buildPublicProposalPath } from "@/lib/proposals/service";
import { normalizePhoneNumber } from "@/lib/validation/phone";

type ProposalActivityDbClient = Prisma.TransactionClient | typeof prisma;

export type ProposalWhatsAppMessageKind =
  | "INITIAL"
  | "UNVIEWED_REMINDER"
  | "VIEWED_FOLLOW_UP";

export type ProposalWhatsAppContext = {
  proposalId: string;
  publicToken: string;
  clientName: string;
  projectId: string;
  quotationNumber: string;
  phone: string | null;
};

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function getProposalShareBaseUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim();
  if (value) return value.replaceAll(/\/+$/g, "");
  return "https://app.buildy.sg";
}

export function buildProposalWhatsAppUrl(token: string): string {
  return `${getProposalShareBaseUrl()}${buildPublicProposalPath(token)}`;
}

export function buildProposalWhatsAppMessage(params: {
  clientName: string;
  token: string;
  kind: ProposalWhatsAppMessageKind;
}): string {
  const clientName = cleanText(params.clientName) ?? "Client";
  const url = buildProposalWhatsAppUrl(params.token);

  if (params.kind === "INITIAL") {
    return `Hi ${clientName},\nYour renovation proposal is ready.\nView here:\n${url}`;
  }

  if (params.kind === "UNVIEWED_REMINDER") {
    return `Hi ${clientName},\nJust following up on your renovation proposal.\nView here:\n${url}`;
  }

  return `Hi ${clientName},\nChecking in on your renovation proposal. Let us know if you have any questions.\nView here:\n${url}`;
}

export async function createProposalActivity(
  db: ProposalActivityDbClient,
  params: {
    proposalId: string;
    type: ProposalActivityType;
    createdAt?: Date;
  },
) {
  return db.proposalActivity.create({
    data: {
      proposalId: params.proposalId,
      type: params.type,
      createdAt: params.createdAt ?? new Date(),
    },
  });
}

export async function getProposalWhatsAppContext(
  proposalId: string,
): Promise<ProposalWhatsAppContext> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      publicToken: true,
      clientName: true,
      quotation: {
        select: {
          projectId: true,
          quotationNumber: true,
          contactPersonSnapshot: true,
          contactPhoneSnapshot: true,
          project: {
            select: {
              clientPhone: true,
              client: {
                select: {
                  phone: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!proposal) throw new Error("Proposal not found.");

  const phone = normalizePhoneNumber(
    proposal.quotation.contactPhoneSnapshot ||
      proposal.quotation.project.clientPhone ||
      proposal.quotation.project.client?.phone ||
      null,
  );

  return {
    proposalId: proposal.id,
    publicToken: proposal.publicToken,
    clientName:
      cleanText(proposal.quotation.contactPersonSnapshot) ??
      cleanText(proposal.clientName) ??
      "Client",
    projectId: proposal.quotation.projectId,
    quotationNumber: proposal.quotation.quotationNumber,
    phone,
  };
}

export async function sendProposalWhatsAppMessage(params: {
  context: ProposalWhatsAppContext;
  kind: ProposalWhatsAppMessageKind;
}) {
  if (!params.context.phone) {
    throw new Error("Client WhatsApp number is not available for this proposal.");
  }

  const body = buildProposalWhatsAppMessage({
    clientName: params.context.clientName,
    token: params.context.publicToken,
    kind: params.kind,
  });

  const result = await sendWhatsApp({
    to: params.context.phone,
    toName: params.context.clientName,
    body,
  });

  return {
    ...params.context,
    body,
    providerMessageId: result.providerMessageId,
  };
}
