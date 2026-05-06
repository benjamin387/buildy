"use server";

import {
  Permission,
  ProjectCommercialStatus,
  ProjectStatus,
  QuotationStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  PROJECT_KICKOFF_CHECKLIST,
  PROJECT_KICKOFF_ITEM_KEYS,
  PROJECT_KICKOFF_ITEM_COUNT,
} from "@/lib/projects/kickoff";
import { requirePermission } from "@/lib/rbac";

const AUTO_COMPLETED_BY = "System";

function actorLabel(user: Awaited<ReturnType<typeof requireUser>>) {
  return user.name?.trim() || user.email?.trim() || user.id;
}

function kickoffPath(projectId: string) {
  return `/projects/${projectId}/kickoff`;
}

function revalidateKickoff(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(kickoffPath(projectId));
  revalidatePath(`/projects/${projectId}/contract`);
  revalidatePath(`/projects/${projectId}/execution`);
  revalidatePath(`/projects/${projectId}/invoices`);
  revalidatePath(`/projects/${projectId}/quotations`);
}

const initializeSchema = z.object({
  projectId: z.string().min(1),
});

export async function initializeProjectKickoff(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = initializeSchema.safeParse({ projectId });
  if (!parsed.success) throw new Error("Invalid project kickoff request.");

  const { userId } = await requirePermission({
    permission: Permission.PROJECT_WRITE,
    projectId,
  });
  const user = await requireUser();
  const now = new Date();

  const [project, approvedProposal, issuedInvoice, receipt, visit, purchaseOrder, subcontract, milestone, plannedProcurementItem] =
    await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          status: true,
          quotationStatus: true,
          targetCompletionDate: true,
          commercialProfile: {
            select: {
              id: true,
              status: true,
              startDate: true,
            },
          },
        },
      }),
      prisma.proposal.findFirst({
        where: {
          quotation: { projectId },
          OR: [
            { status: "APPROVED" },
            { approvals: { some: { status: "APPROVED" } } },
            { signatures: { some: {} } },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          status: true,
          quotation: {
            select: {
              id: true,
              status: true,
            },
          },
          approvals: {
            where: { status: "APPROVED" },
            select: { id: true },
            take: 1,
          },
          signatures: {
            select: { id: true },
            take: 1,
          },
        },
      }),
      prisma.invoice.findFirst({
        where: {
          projectId,
          status: { notIn: ["DRAFT", "VOID"] },
        },
        select: { id: true },
        orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
      }),
      prisma.paymentReceipt.findFirst({
        where: { projectId },
        select: { id: true },
      }),
      prisma.siteVisit.findFirst({
        where: {
          projectId,
          status: { in: ["SCHEDULED", "COMPLETED"] },
        },
        select: { id: true },
      }),
      prisma.purchaseOrder.findFirst({
        where: { projectId },
        select: { id: true },
      }),
      prisma.subcontract.findFirst({
        where: { projectId },
        select: { id: true },
      }),
      prisma.projectMilestone.findFirst({
        where: { projectId },
        select: { id: true },
      }),
      prisma.projectProcurementPlanItem.findFirst({
        where: {
          plan: { projectId },
          plannedVendorId: { not: null },
        },
        select: { id: true },
      }),
    ]);

  if (!project) throw new Error("Project not found.");

  const hasSignedProposal = Boolean(
    approvedProposal?.signatures[0] || approvedProposal?.status === "APPROVED",
  );
  const hasApprovedQuotation =
    project.quotationStatus === QuotationStatus.APPROVED || Boolean(approvedProposal);
  const hasContract = (await prisma.contract.count({ where: { projectId } })) > 0;
  const hasIssuedInvoice = Boolean(issuedInvoice);
  const hasDepositReceived = Boolean(receipt);
  const hasSiteMeasurementScheduled = Boolean(visit);
  const hasSupplierAssigned = Boolean(
    purchaseOrder || subcontract || plannedProcurementItem,
  );
  const hasTimelineConfirmed = Boolean(milestone);
  const hasHandoverTargetDate = Boolean(project.targetCompletionDate);
  const commercialProfile = project.commercialProfile;

  const autoCompleteKeys = new Set<string>();
  if (hasSignedProposal) autoCompleteKeys.add("SIGNED_PROPOSAL");
  if (hasApprovedQuotation) autoCompleteKeys.add("APPROVED_QUOTATION");
  if (hasContract) autoCompleteKeys.add("CONTRACT_GENERATED");
  if (hasIssuedInvoice) autoCompleteKeys.add("INITIAL_INVOICE_ISSUED");
  if (hasDepositReceived) autoCompleteKeys.add("DEPOSIT_RECEIVED");
  if (hasSiteMeasurementScheduled) autoCompleteKeys.add("SITE_MEASUREMENT_SCHEDULED");
  if (hasSupplierAssigned) autoCompleteKeys.add("SUPPLIER_OR_SUBCONTRACTOR_ASSIGNED");
  if (hasTimelineConfirmed) autoCompleteKeys.add("PROJECT_TIMELINE_CONFIRMED");
  if (hasHandoverTargetDate) autoCompleteKeys.add("HANDOVER_TARGET_DATE_SET");

  const shouldApproveQuotation =
    Boolean(approvedProposal) &&
    approvedProposal?.quotation.status !== QuotationStatus.APPROVED;
  const shouldSetProjectQuotationApproved =
    Boolean(approvedProposal) &&
    project.quotationStatus !== QuotationStatus.APPROVED;
  const shouldPromoteProjectStatus =
    project.status === ProjectStatus.LEAD ||
    project.status === ProjectStatus.QUOTING;
  const shouldPromoteCommercialStatus =
    commercialProfile !== null &&
    (commercialProfile.status === ProjectCommercialStatus.LEAD ||
      commercialProfile.status === ProjectCommercialStatus.QUOTING ||
      commercialProfile.status === ProjectCommercialStatus.CONTRACTED);

  const result = await prisma.$transaction(async (tx) => {
    if (shouldApproveQuotation && approvedProposal) {
      await tx.quotation.update({
        where: { id: approvedProposal.quotation.id },
        data: { status: QuotationStatus.APPROVED },
      });
    }

    if (shouldSetProjectQuotationApproved || shouldPromoteProjectStatus) {
      await tx.project.update({
        where: { id: projectId },
        data: {
          quotationStatus: shouldSetProjectQuotationApproved
            ? QuotationStatus.APPROVED
            : undefined,
          status: shouldPromoteProjectStatus ? ProjectStatus.CONTRACTED : undefined,
        },
      });
    }

    if (shouldPromoteCommercialStatus && commercialProfile) {
      await tx.projectCommercialProfile.update({
        where: { projectId },
        data: {
          status: ProjectCommercialStatus.CONTRACTED,
        },
      });
    }

    const created = await tx.projectKickoffChecklist.createMany({
      data: PROJECT_KICKOFF_CHECKLIST.map((item) => ({
        projectId,
        itemKey: item.itemKey,
        label: item.label,
        isCompleted: autoCompleteKeys.has(item.itemKey),
        completedAt: autoCompleteKeys.has(item.itemKey) ? now : null,
        completedBy: autoCompleteKeys.has(item.itemKey) ? AUTO_COMPLETED_BY : null,
      })),
      skipDuplicates: true,
    });

    if (
      created.count > 0 ||
      shouldApproveQuotation ||
      shouldSetProjectQuotationApproved ||
      shouldPromoteProjectStatus
    ) {
      await tx.projectTimelineItem.create({
        data: {
          projectId,
          type: "NOTE",
          title: "Project kickoff initialized",
          description:
            "Kickoff checklist created and project conversion controls were synchronized.",
          createdById: userId,
          metadata: {
            checklistItemsCreated: created.count,
            projectStatusBefore: project.status,
            projectStatusAfter: shouldPromoteProjectStatus
              ? ProjectStatus.CONTRACTED
              : project.status,
            quotationApproved: shouldApproveQuotation || shouldSetProjectQuotationApproved,
          },
        },
      });
    }

    return { createdCount: created.count };
  });

  await auditLog({
    module: "project",
    action: "kickoff_initialize",
    actorUserId: userId,
    projectId,
    entityType: "Project",
    entityId: projectId,
    metadata: {
      checklistItemsCreated: result.createdCount,
      autoCompletedKeys: Array.from(autoCompleteKeys),
      actor: actorLabel(user),
    },
  });

  revalidateKickoff(projectId);
  redirect(kickoffPath(projectId));
}

const toggleSchema = z.object({
  projectId: z.string().min(1),
  itemKey: z.enum(PROJECT_KICKOFF_ITEM_KEYS),
});

export async function toggleKickoffChecklistItem(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = toggleSchema.safeParse({
    projectId,
    itemKey: formData.get("itemKey"),
  });
  if (!parsed.success) throw new Error("Invalid kickoff checklist update.");

  await requirePermission({
    permission: Permission.PROJECT_WRITE,
    projectId,
  });
  const user = await requireUser();
  const item = await prisma.projectKickoffChecklist.findUnique({
    where: {
      projectId_itemKey: {
        projectId,
        itemKey: parsed.data.itemKey,
      },
    },
    select: {
      id: true,
      isCompleted: true,
    },
  });

  if (!item) {
    redirect(kickoffPath(projectId));
  }

  const now = new Date();
  await prisma.projectKickoffChecklist.update({
    where: { id: item.id },
    data: {
      isCompleted: !item.isCompleted,
      completedAt: item.isCompleted ? null : now,
      completedBy: item.isCompleted ? null : actorLabel(user),
    },
  });

  revalidateKickoff(projectId);
  redirect(kickoffPath(projectId));
}

const readySchema = z.object({
  projectId: z.string().min(1),
});

export async function markProjectReadyForExecution(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = readySchema.safeParse({ projectId });
  if (!parsed.success) throw new Error("Invalid project readiness request.");

  const { userId } = await requirePermission({
    permission: Permission.PROJECT_WRITE,
    projectId,
  });
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      startDate: true,
      commercialProfile: {
        select: {
          id: true,
          status: true,
          startDate: true,
        },
      },
      kickoffChecklistItems: {
        select: {
          itemKey: true,
          isCompleted: true,
        },
      },
    },
  });

  if (!project) throw new Error("Project not found.");

  const incompleteKeys = project.kickoffChecklistItems
    .filter((item) => !item.isCompleted)
    .map((item) => item.itemKey);

  if (
    project.kickoffChecklistItems.length < PROJECT_KICKOFF_ITEM_COUNT ||
    incompleteKeys.length > 0
  ) {
    redirect(kickoffPath(projectId));
  }

  if (project.status === ProjectStatus.IN_PROGRESS) {
    revalidateKickoff(projectId);
    redirect(`/projects/${projectId}/execution`);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.IN_PROGRESS,
        startDate: project.startDate ?? now,
      },
    });

    if (
      project.commercialProfile &&
      project.commercialProfile.status !== ProjectCommercialStatus.IN_PROGRESS
    ) {
      await tx.projectCommercialProfile.update({
        where: { projectId },
        data: {
          status: ProjectCommercialStatus.IN_PROGRESS,
          startDate: project.commercialProfile.startDate ?? project.startDate ?? now,
        },
      });
    }

    await tx.projectTimelineItem.create({
      data: {
        projectId,
        type: "STATUS_CHANGE",
        title: "Project ready for execution",
        description:
          "Kickoff checklist fully completed and project moved into active execution.",
        createdById: userId,
        metadata: {
          previousStatus: project.status,
          nextStatus: ProjectStatus.IN_PROGRESS,
          checklistCompleted: PROJECT_KICKOFF_ITEM_COUNT,
        },
      },
    });
  });

  await auditLog({
    module: "project",
    action: "kickoff_ready_for_execution",
    actorUserId: userId,
    projectId,
    entityType: "Project",
    entityId: projectId,
    metadata: {
      previousStatus: project.status,
      nextStatus: ProjectStatus.IN_PROGRESS,
      checklistCompleted: PROJECT_KICKOFF_ITEM_COUNT,
      incompleteKeys,
    },
  });

  revalidateKickoff(projectId);
  redirect(`/projects/${projectId}/execution`);
}
