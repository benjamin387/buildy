"use server";

import { Permission } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createOrUpdateProposalFromQuotation } from "@/lib/proposals/service";
import { requirePermission } from "@/lib/rbac";

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
