import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { ProjectQuotationBuilder } from "@/app/(platform)/projects/[projectId]/quotation/new/quotation-builder";

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

  return (
    <ProjectQuotationBuilder
      projectId={projectId}
      projectName={project.name}
      clientName={project.client.name}
      gstRate={
        project.commercialProfile?.gstRate
          ? Number(project.commercialProfile.gstRate)
          : 0.09
      }
    />
  );
}

