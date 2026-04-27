import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requirePermission as requireModulePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { QuotationBuilder } from "@/app/(platform)/projects/[projectId]/quotations/shared/quotation-builder";
import { listDesignPackagesForQuotationBuilder } from "@/lib/design-packages/service";

function isoDate(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function EditProjectQuotationPage({
  params,
}: {
  params: Promise<{ projectId: string; quotationId: string }>;
}) {
  const { projectId, quotationId } = await params;
  await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });
  await requireModulePermission({ moduleKey: "QUOTATIONS" satisfies PermissionModuleKey, action: "edit" });

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      project: { include: { client: true, commercialProfile: true } },
      paymentTermsV2: { orderBy: { sortOrder: "asc" } },
      sections: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!quotation || quotation.projectId !== projectId) notFound();

  const itemMasters = await prisma.itemMaster.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      sku: true,
      name: true,
      description: true,
      sellPrice: true,
      costPrice: true,
      unitId: true,
      unit: { select: { id: true, code: true, name: true } },
    },
    orderBy: { name: "asc" },
    take: 250,
  });

  const initialState = {
    issueDate: isoDate(quotation.issueDate),
    validityDays: quotation.validityDays ?? 14,
    notes: quotation.notes ?? "",
    exclusions: quotation.exclusions ?? "",
    discountAmount: Number(quotation.discountAmount),
    sections: quotation.sections.map((s) => ({
      category: s.category,
      title: s.title,
      description: s.description ?? "",
      isIncluded: s.isIncluded,
      isOptional: s.isOptional,
      remarks: s.remarks ?? "",
      lineItems: s.lineItems.map((li) => ({
        sku: li.sku,
        itemMasterId: li.itemMasterId ?? null,
        unitOfMeasureId: li.unitOfMeasureId ?? null,
        description: li.description,
        specification: li.specification ?? "",
        unit: li.unit,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        costPrice: Number(li.costPrice),
        remarks: li.remarks ?? "",
        itemType: li.itemType,
        isIncluded: li.isIncluded,
        isOptional: li.isOptional,
      })),
    })),
    paymentTermsV2:
      quotation.paymentTermsV2.length > 0
        ? quotation.paymentTermsV2.map((term) => ({
            title: term.title,
            percent: term.percent === null ? null : Number(term.percent),
            amount: term.amount === null ? null : Number(term.amount),
            triggerType: term.triggerType ?? "CUSTOM",
            dueDays: term.dueDays ?? 0,
            sortOrder: term.sortOrder,
          }))
        : [
            {
              title: "50% project start",
              percent: 50,
              amount: null,
              triggerType: "PROJECT_START",
              dueDays: 0,
              sortOrder: 0,
            },
            {
              title: "50% project handover",
              percent: 50,
              amount: null,
              triggerType: "PROJECT_HANDOVER",
              dueDays: 0,
              sortOrder: 1,
            },
          ],
  };

  const lead = await prisma.lead.findFirst({
    where: { convertedProjectId: projectId },
    orderBy: [{ convertedAt: "desc" }, { createdAt: "desc" }],
    select: { preferredDesignStyle: true },
  });

  const suggested = await listDesignPackagesForQuotationBuilder({
    propertyType: quotation.project.propertyType,
    designStyle: lead?.preferredDesignStyle ?? null,
  });

  const designPackages =
    suggested.length > 0
      ? suggested
      : await listDesignPackagesForQuotationBuilder({
          propertyType: quotation.project.propertyType,
          designStyle: null,
        });

  return (
    <QuotationBuilder
      mode="edit"
      quotationId={quotationId}
      projectId={projectId}
      projectName={quotation.project.name}
      clientName={quotation.project.client.name}
      gstRate={
        quotation.project.commercialProfile?.gstRate
          ? Number(quotation.project.commercialProfile.gstRate)
          : 0.09
      }
      itemMasters={itemMasters.map((item) => ({
        ...item,
        sellPrice: Number(item.sellPrice),
        costPrice: Number(item.costPrice),
      }))}
      designPackages={designPackages.map((p) => ({
        ...p,
        rooms: p.rooms.map((r) => ({
          ...r,
          boqItems: r.boqItems.map((bi) => ({
            ...bi,
            defaultQuantity: Number(bi.defaultQuantity),
            defaultUnitPrice: Number(bi.defaultUnitPrice),
            defaultCostPrice: Number(bi.defaultCostPrice),
          })),
        })),
      }))}
      initialState={initialState}
    />
  );
}
