import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { QuotationBuilder } from "@/app/(platform)/projects/[projectId]/quotations/shared/quotation-builder";
import { listDesignPackagesForQuotationBuilder } from "@/lib/design-packages/service";

export default async function NewProjectQuotationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true, commercialProfile: true },
  });
  if (!project) notFound();

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

  const lead = await prisma.lead.findFirst({
    where: { convertedProjectId: projectId },
    orderBy: [{ convertedAt: "desc" }, { createdAt: "desc" }],
    select: { preferredDesignStyle: true },
  });

  const suggested = await listDesignPackagesForQuotationBuilder({
    propertyType: project.propertyType,
    designStyle: lead?.preferredDesignStyle ?? null,
  });

  const designPackages =
    suggested.length > 0
      ? suggested
      : await listDesignPackagesForQuotationBuilder({
          propertyType: project.propertyType,
          designStyle: null,
        });

  return (
    <QuotationBuilder
      mode="create"
      projectId={projectId}
      projectName={project.name}
      clientName={project.client.name}
      gstRate={project.commercialProfile?.gstRate ? Number(project.commercialProfile.gstRate) : 0.09}
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
    />
  );
}
