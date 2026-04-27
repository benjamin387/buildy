"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPortalProject, requireClientPortalAccount } from "@/lib/client-portal/auth";

const acceptSchema = z.object({
  projectId: z.string().min(1),
  quotationId: z.string().min(1),
});

export async function acceptQuotationAction(formData: FormData) {
  const parsed = acceptSchema.safeParse({
    projectId: formData.get("projectId"),
    quotationId: formData.get("quotationId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const account = await requireClientPortalAccount();
  await requireClientPortalProject({ projectId: parsed.data.projectId });

  const quotation = await prisma.quotation.findUnique({
    where: { id: parsed.data.quotationId },
    select: { id: true, projectId: true, status: true, isLatest: true },
  });
  if (!quotation || quotation.projectId !== parsed.data.projectId) throw new Error("Not found.");
  if (!quotation.isLatest) throw new Error("Only the latest quotation can be accepted.");
  if (quotation.status !== "SENT") throw new Error("Quotation is not in SENT status.");

  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({ where: { id: quotation.id }, data: { status: "APPROVED" } });
    await tx.project.update({ where: { id: parsed.data.projectId }, data: { quotationStatus: "APPROVED" } });
    await tx.quotationAcceptance.upsert({
      where: { quotationId: quotation.id },
      create: {
        quotationId: quotation.id,
        acceptedByName: account.name,
        acceptedByCompany: null,
        acceptedAt: new Date(),
        signatureUrl: null,
        notes: "Accepted via Client Portal.",
      },
      update: {
        acceptedByName: account.name,
        acceptedAt: new Date(),
        notes: "Accepted via Client Portal.",
      },
    });
  });

  redirect(`/client/portal/projects/${parsed.data.projectId}/quotation?status=accepted`);
}

const rejectSchema = z.object({
  projectId: z.string().min(1),
  quotationId: z.string().min(1),
  remarks: z.string().min(1).max(2000),
});

export async function rejectQuotationAction(formData: FormData) {
  const parsed = rejectSchema.safeParse({
    projectId: formData.get("projectId"),
    quotationId: formData.get("quotationId"),
    remarks: formData.get("remarks"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const account = await requireClientPortalAccount();
  await requireClientPortalProject({ projectId: parsed.data.projectId });

  const quotation = await prisma.quotation.findUnique({
    where: { id: parsed.data.quotationId },
    select: { id: true, projectId: true, status: true, isLatest: true },
  });
  if (!quotation || quotation.projectId !== parsed.data.projectId) throw new Error("Not found.");
  if (!quotation.isLatest) throw new Error("Only the latest quotation can be rejected.");
  if (quotation.status !== "SENT") throw new Error("Quotation is not in SENT status.");

  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({ where: { id: quotation.id }, data: { status: "REJECTED" } });
    await tx.project.update({ where: { id: parsed.data.projectId }, data: { quotationStatus: "REJECTED" } });
    await tx.quotationAcceptance.upsert({
      where: { quotationId: quotation.id },
      create: {
        quotationId: quotation.id,
        acceptedByName: account.name,
        acceptedByCompany: null,
        acceptedAt: null,
        signatureUrl: null,
        notes: `Rejected via Client Portal: ${parsed.data.remarks}`,
      },
      update: {
        acceptedByName: account.name,
        acceptedAt: null,
        notes: `Rejected via Client Portal: ${parsed.data.remarks}`,
      },
    });
  });

  redirect(`/client/portal/projects/${parsed.data.projectId}/quotation?status=rejected`);
}

