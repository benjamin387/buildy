"use server";

import { Permission, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requirePermission as requireModulePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { generateContractNumber } from "@/lib/contracts/contract-number";
import { DEFAULT_CONTRACT_CLAUSE_ORDER, getDefaultClauseTemplates } from "@/lib/contracts/clause-templates";
import { auditLog, createRevision } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const createContractSchema = z.object({
  projectId: z.string().min(1),
  quotationId: z.string().min(1),
  contractDate: z.string().min(1),
});

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeEmailList(value: string): string[] {
  return value
    .split(/[\n,; ]+/g)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.toLowerCase());
}

function renderClauseContent(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    const value = vars[key];
    return value === undefined ? full : value;
  });
}

export async function createContract(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createContractSchema.safeParse({
    projectId,
    quotationId: formData.get("quotationId"),
    contractDate: formData.get("contractDate"),
  });
  if (!parsed.success) throw new Error("Invalid contract input.");

  const { userId } = await requirePermission({
    permission: Permission.CONTRACT_WRITE,
    projectId,
  });

  const quotation = await prisma.quotation.findUnique({
    where: { id: parsed.data.quotationId },
    include: {
      project: { include: { client: true, commercialProfile: true } },
      paymentTermsV2: { orderBy: { sortOrder: "asc" } },
      sections: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!quotation || quotation.projectId !== projectId) throw new Error("Quotation not found.");
  if (quotation.status !== "APPROVED") {
    throw new Error("Only an accepted (APPROVED) quotation can generate a contract.");
  }

  const contractDate = new Date(parsed.data.contractDate);
  const contractNumber = generateContractNumber(contractDate);

  const netSubtotal = Math.max(
    roundCurrency(Number(quotation.subtotal) - Number(quotation.discountAmount)),
    0,
  );

  const contract = await prisma.$transaction(async (tx) => {
    // Ensure templates exist (idempotent).
    const templates = getDefaultClauseTemplates();
    await tx.clauseTemplate.createMany({
      data: templates.map((t) => ({
        code: t.code,
        title: t.title,
        content: t.content,
        category: t.category,
        isDefault: t.isDefault,
        createdAt: new Date(),
      })),
      skipDuplicates: true,
    });

    const created = await tx.contract.create({
      data: {
        projectId,
        quotationId: quotation.id,
        contractNumber,
        version: 1,
        contractDate,
        status: "DRAFT",

        clientNameSnapshot: quotation.clientNameSnapshot,
        clientCompanySnapshot: quotation.companyNameSnapshot ?? null,
        clientEmailSnapshot: quotation.contactEmailSnapshot ?? null,
        clientPhoneSnapshot: quotation.contactPhoneSnapshot ?? null,

        projectNameSnapshot: quotation.projectNameSnapshot,
        projectAddress1: quotation.projectAddress1,
        projectAddress2: quotation.projectAddress2 ?? null,
        projectPostalCode: quotation.projectPostalCode ?? null,

        contractSubtotal: new Prisma.Decimal(netSubtotal),
        discountAmount: quotation.discountAmount,
        gstAmount: quotation.gstAmount,
        totalAmount: quotation.totalAmount,
        contractValue: quotation.totalAmount,

        retentionAmount: 0,
        defectsLiabilityDays: 0,
        warrantyMonths: 0,

        scopeOfWork: "Scope of work is based on the attached quotation and any approved variation orders.",
        paymentTerms: quotation.paymentTerms ?? null,
        warrantyTerms:
          "Defects liability and warranty period to be agreed; workmanship defects to be rectified within a reasonable time upon notification.",
        variationPolicy:
          "Variation orders must be documented and approved in writing prior to execution. Unapproved variations are excluded from contract value.",
        defectsPolicy:
          "Defects noted during handover or within the defects liability period will be addressed subject to agreed exclusions and misuse.",
        insurancePolicy:
          "Contractor to maintain relevant insurances where required (public liability, workmen compensation) subject to project needs.",
        termsText:
          "This contract is formed based on the accepted quotation, agreed scope, and the terms & conditions stated herein. All staged payments must be fulfilled according to the payment schedule. Variations require written approval prior to execution.",
        notes: null,

        scopeSnapshot: {
          quotation: {
            id: quotation.id,
            quotationNumber: quotation.quotationNumber,
            version: quotation.version,
            issueDate: quotation.issueDate,
          },
          sections: quotation.sections.map((s) => ({
            id: s.id,
            category: s.category,
            title: s.title,
            description: s.description,
            sortOrder: s.sortOrder,
            subtotal: Number(s.subtotal),
            lineItems: s.lineItems.map((li) => ({
              id: li.id,
              sku: li.sku,
              description: li.description,
              specification: li.specification,
              unit: li.unit,
              quantity: Number(li.quantity),
              unitPrice: Number(li.unitPrice),
              totalPrice: Number(li.totalPrice),
              sortOrder: li.sortOrder,
              isIncluded: li.isIncluded,
              isOptional: li.isOptional,
            })),
          })),
          totals: {
            subtotal: Number(quotation.subtotal),
            discountAmount: Number(quotation.discountAmount),
            netSubtotal,
            gstAmount: Number(quotation.gstAmount),
            totalAmount: Number(quotation.totalAmount),
          },
          paymentTerms: quotation.paymentTermsV2.map((term) => ({
            title: term.title,
            percent: term.percent === null ? null : Number(term.percent),
            amount: term.amount === null ? null : Number(term.amount),
            triggerType: term.triggerType,
            dueDays: term.dueDays,
            sortOrder: term.sortOrder,
          })),
        },
        paymentTermsSnapshot: quotation.paymentTermsV2.map((term) => ({
          title: term.title,
          percent: term.percent === null ? null : Number(term.percent),
          amount: term.amount === null ? null : Number(term.amount),
          triggerType: term.triggerType,
          dueDays: term.dueDays,
          sortOrder: term.sortOrder,
        })),
      },
    });

    // Contract clauses are a snapshot generated at creation time from templates,
    // then optionally edited (while draft) and locked after signing.
    const defectsLiabilityDays =
      created.defectsLiabilityDays > 0 ? String(created.defectsLiabilityDays) : "30";
    const warrantyMonths = created.warrantyMonths > 0 ? String(created.warrantyMonths) : "12";

    const clauseVars: Record<string, string> = {
      defectsLiabilityDays,
      warrantyMonths,
      contractNumber: created.contractNumber,
      clientName: created.clientNameSnapshot,
      projectName: created.projectNameSnapshot,
    };

    const clauseKeyToEditable = new Map<string, boolean>([
      ["SCOPE_OF_WORKS", true],
      ["CONTRACT_SUM", false],
      ["PAYMENT_TERMS", true],
      ["VARIATION", false],
      ["TIMELINE_COMPLETION", true],
      ["DEFECTS_WARRANTY", true],
      ["LIQUIDATED_DAMAGES", true],
      ["INSURANCE", true],
      ["INDEMNITY", true],
      ["TERMINATION", true],
      ["COMMUNICATION", false],
      ["GOVERNING_LAW", false],
    ]);

    const clausesToCreate = DEFAULT_CONTRACT_CLAUSE_ORDER.map((key, idx) => {
      const template = templates.find((t) => t.code === key);
      if (!template) return null;
      return {
        contractId: created.id,
        clauseKey: template.code,
        title: template.title,
        content: renderClauseContent(template.content, clauseVars),
        sortOrder: idx,
        isEditable: clauseKeyToEditable.get(template.code) ?? true,
        createdAt: new Date(),
      };
    }).filter((v): v is NonNullable<typeof v> => v !== null);

    if (clausesToCreate.length > 0) {
      await tx.contractClause.createMany({ data: clausesToCreate, skipDuplicates: true });
    }

    if (quotation.paymentTermsV2.length > 0) {
      await tx.contractMilestone.createMany({
        data: quotation.paymentTermsV2.map((term, index) => {
          const amount =
            term.amount !== null
              ? Number(term.amount)
              : term.percent !== null
                ? roundCurrency((Number(term.percent) / 100) * netSubtotal)
                : 0;
          return {
            contractId: created.id,
            title: term.title,
            description: term.triggerType ?? null,
            dueDate: null,
            amount: new Prisma.Decimal(amount),
            status: "PLANNED",
            sortOrder: index,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }),
      });
    }

    await tx.project.update({
      where: { id: projectId },
      data: { contractStatus: "DRAFT" },
    });

    return created;
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "CONTRACT",
      title: `Contract drafted: ${contract.contractNumber}`,
      createdById: userId,
      metadata: { contractId: contract.id, quotationId: quotation.id },
    },
  });

  await auditLog({
    module: "contract",
    action: "create",
    actorUserId: userId,
    projectId,
    entityType: "Contract",
    entityId: contract.id,
    metadata: { contractNumber: contract.contractNumber, quotationId: quotation.id },
  });

  await createRevision({
    entityType: "Contract",
    entityId: contract.id,
    projectId,
    actorUserId: userId,
    note: "Draft created",
    data: {
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      quotationId: quotation.id,
      totalAmount: Number(contract.totalAmount),
    },
  });

  revalidatePath(`/projects/${projectId}/contract`);
  redirect(`/projects/${projectId}/contract/${contract.id}`);
}

const sendForSignatureSchema = z.object({
  projectId: z.string().min(1),
  contractId: z.string().min(1),
  additionalClientEmails: z.string().optional(),
  additionalCompanyEmails: z.string().optional(),
});

export async function sendContractForSignature(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = sendForSignatureSchema.safeParse({
    projectId,
    contractId: formData.get("contractId"),
    additionalClientEmails: formData.get("additionalClientEmails")?.toString() || "",
    additionalCompanyEmails: formData.get("additionalCompanyEmails")?.toString() || "",
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({
    permission: Permission.CONTRACT_APPROVE,
    projectId,
  });
  await requireModulePermission({ moduleKey: "CONTRACTS" satisfies PermissionModuleKey, action: "send" });

  const contract = await prisma.contract.findUnique({
    where: { id: parsed.data.contractId },
    include: { quotation: true },
  });
  if (!contract || contract.projectId !== projectId) throw new Error("Not found.");
  if (contract.status !== "DRAFT") throw new Error("Only draft contracts can be sent for signing.");
  if (contract.lockedAt) throw new Error("Contract is locked.");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (!user?.email) throw new Error("Missing company signer identity.");

  const clientEmail =
    contract.clientEmailSnapshot ||
    contract.quotation?.contactEmailSnapshot ||
    null;
  if (!clientEmail) throw new Error("Client email is required to send for signing.");

  const additionalClientEmails = normalizeEmailList(parsed.data.additionalClientEmails ?? "");
  const additionalCompanyEmails = normalizeEmailList(parsed.data.additionalCompanyEmails ?? "");

  const allClientEmails = [clientEmail.toLowerCase(), ...additionalClientEmails].filter(Boolean);
  const allCompanyEmails = [user.email.toLowerCase(), ...additionalCompanyEmails].filter(Boolean);

  // Ensure uniqueness to satisfy DB constraints.
  const uniqueClientEmails = Array.from(new Set(allClientEmails));
  const uniqueCompanyEmails = Array.from(new Set(allCompanyEmails));

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const signatureRequest = await prisma.$transaction(async (tx) => {
    const parties = [
      ...uniqueClientEmails.map((email, idx) => ({
        name: idx === 0 ? contract.clientNameSnapshot : email.split("@")[0] || "Client",
        email,
        role: "CLIENT" as const,
        sequenceNo: idx + 1,
        status: "PENDING" as const,
      })),
      ...uniqueCompanyEmails.map((email, idx) => ({
        name: email === user.email.toLowerCase() ? (user.name ?? "Company") : email.split("@")[0] || "Company",
        email,
        role: "COMPANY" as const,
        sequenceNo: uniqueClientEmails.length + idx + 1,
        status: "PENDING" as const,
      })),
    ];

    const request = await tx.signatureRequest.create({
      data: {
        documentType: "CONTRACT",
        documentId: contract.id,
        contractId: contract.id,
        status: "SENT",
        sentAt: now,
        expiresAt,
        parties: {
          create: [
            ...parties,
          ],
        },
        events: {
          create: [
            {
              eventType: "CREATED",
              actorName: user.name ?? null,
              actorEmail: user.email,
              ipAddress: null,
              userAgent: null,
              eventAt: now,
            },
            {
              eventType: "SENT",
              actorName: user.name ?? null,
              actorEmail: user.email,
              ipAddress: null,
              userAgent: null,
              eventAt: now,
            },
          ],
        },
      },
      include: { parties: true },
    });

    await tx.contract.update({
      where: { id: contract.id },
      data: { status: "SENT" },
    });

    await tx.project.update({
      where: { id: projectId },
      data: { contractStatus: "SENT" },
    });

    return request;
  });

  await auditLog({
    module: "contract",
    action: "esign_send",
    actorUserId: userId,
    projectId,
    entityType: "SignatureRequest",
    entityId: signatureRequest.id,
    metadata: { contractId: contract.id, partyCount: signatureRequest.parties.length },
  });

  await createRevision({
    entityType: "Contract",
    entityId: contract.id,
    projectId,
    actorUserId: userId,
    note: "Sent for e-signature",
    data: {
      contractId: contract.id,
      signatureRequestId: signatureRequest.id,
      parties: signatureRequest.parties.map((p) => ({ id: p.id, email: p.email, role: p.role })),
    },
  });

  revalidatePath(`/projects/${projectId}/contract/${contract.id}`);
  redirect(`/projects/${projectId}/contract/${contract.id}`);
}

const updateClauseSchema = z.object({
  projectId: z.string().min(1),
  contractId: z.string().min(1),
  clauseId: z.string().min(1),
  content: z.string().min(1),
});

export async function updateContractClause(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = updateClauseSchema.safeParse({
    projectId,
    contractId: formData.get("contractId"),
    clauseId: formData.get("clauseId"),
    content: formData.get("content"),
  });
  if (!parsed.success) throw new Error("Invalid clause input.");

  const { userId } = await requirePermission({
    permission: Permission.CONTRACT_WRITE,
    projectId,
  });

  const clause = await prisma.contractClause.findUnique({
    where: { id: parsed.data.clauseId },
    include: { contract: true },
  });
  if (!clause || clause.contractId !== parsed.data.contractId) throw new Error("Not found.");
  if (clause.contract.projectId !== projectId) throw new Error("Not found.");
  if (clause.contract.lockedAt || clause.contract.status === "SIGNED") {
    throw new Error("Contract is locked.");
  }
  if (!clause.isEditable) throw new Error("This clause is not editable.");

  await prisma.contractClause.update({
    where: { id: clause.id },
    data: { content: parsed.data.content },
  });

  await auditLog({
    module: "contract",
    action: "clause_update",
    actorUserId: userId,
    projectId,
    entityType: "ContractClause",
    entityId: clause.id,
    metadata: { contractId: clause.contractId, clauseKey: clause.clauseKey },
  });

  await createRevision({
    entityType: "Contract",
    entityId: clause.contractId,
    projectId,
    actorUserId: userId,
    note: `Clause updated: ${clause.clauseKey}`,
    data: { clauseId: clause.id, clauseKey: clause.clauseKey },
  });

  revalidatePath(`/projects/${projectId}/contract/${clause.contractId}`);
  redirect(`/projects/${projectId}/contract/${clause.contractId}`);
}
