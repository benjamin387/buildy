"use server";

import { Permission, ProposalActivityType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  createProposalActivity,
  getProposalWhatsAppContext,
  sendProposalWhatsAppMessage,
} from "@/lib/proposals/activity";
import { createOrUpdateProposalFromQuotation } from "@/lib/proposals/service";
import { requirePermission } from "@/lib/rbac";

function buildProposalRedirectPath(
  proposalId: string,
  params?: Record<string, string>,
) {
  const searchParams = new URLSearchParams(params);
  const query = searchParams.toString();
  return query ? `/proposals/${proposalId}?${query}` : `/proposals/${proposalId}`;
}

export async function generateProposalFromQuotation(quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      projectId: true,
      quotationNumber: true,
      proposal: { select: { id: true } },
    },
  });

  if (!quotation) throw new Error("Quotation not found.");

  const { userId } = await requirePermission({
    permission: Permission.QUOTE_WRITE,
    projectId: quotation.projectId,
  });

  const proposal = await createOrUpdateProposalFromQuotation(quotationId);
  const action = quotation.proposal ? "regenerate_proposal" : "generate_proposal";

  await auditLog({
    module: "quotation",
    action,
    actorUserId: userId,
    projectId: quotation.projectId,
    entityType: "Proposal",
    entityId: proposal.id,
    metadata: {
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
    },
  });

  revalidatePath(`/projects/${quotation.projectId}/quotations/${quotation.id}`);
  revalidatePath(`/proposals/${proposal.id}`);
  revalidatePath(`/share/proposal/${proposal.publicToken}`);

  redirect(`/proposals/${proposal.id}`);
}

export async function sendProposalWhatsApp(proposalId: string) {
  const context = await getProposalWhatsAppContext(proposalId);
  let providerMessageId = "";

  const { userId } = await requirePermission({
    permission: Permission.QUOTE_WRITE,
    projectId: context.projectId,
  });

  try {
    const sent = await sendProposalWhatsAppMessage({
      context,
      kind: "INITIAL",
    });
    providerMessageId = sent.providerMessageId;

    await createProposalActivity(prisma, {
      proposalId: context.proposalId,
      type: ProposalActivityType.SENT,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send the proposal via WhatsApp.";
    redirect(
      buildProposalRedirectPath(proposalId, {
        whatsapp: "error",
        message,
      }),
    );
  }

  await auditLog({
    module: "proposal",
    action: "send_proposal_whatsapp",
    actorUserId: userId,
    projectId: context.projectId,
    entityType: "Proposal",
    entityId: context.proposalId,
    metadata: {
      channel: "WHATSAPP",
      quotationNumber: context.quotationNumber,
      recipientPhone: context.phone,
      providerMessageId,
    },
  }).catch(() => undefined);

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath(`/share/proposal/${context.publicToken}`);

  redirect(
    buildProposalRedirectPath(proposalId, {
      whatsapp: "sent",
    }),
  );
}
