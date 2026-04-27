import {
  BillingStatus,
  ContractStatus,
  MilestoneStatus,
  Prisma,
  ProjectRole,
  ProjectStatus,
  QuotationStatus,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateProjectCode } from "@/lib/projects/project-code";

function asDecimal(value: number | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value ?? 0);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeProjectedProfit(params: {
  contractValue: number;
  revisedContractValue: number;
  estimatedCost: number;
}): number {
  const revenue =
    params.revisedContractValue > 0 ? params.revisedContractValue : params.contractValue;
  return roundCurrency(revenue - params.estimatedCost);
}

function computeActualProfit(params: {
  contractValue: number;
  revisedContractValue: number;
  actualCost: number;
}): number {
  const revenue =
    params.revisedContractValue > 0 ? params.revisedContractValue : params.contractValue;
  return roundCurrency(revenue - params.actualCost);
}

export type ListProjectsInput = {
  search?: string;
};

function projectSearchWhere(search: string) {
  return {
    OR: [
      { projectCode: { contains: search, mode: "insensitive" as const } },
      { name: { contains: search, mode: "insensitive" as const } },
      { clientName: { contains: search, mode: "insensitive" as const } },
      { clientEmail: { contains: search, mode: "insensitive" as const } },
      { siteAddress: { contains: search, mode: "insensitive" as const } },
    ],
  };
}

const projectListSelect = {
  id: true,
  projectCode: true,
  name: true,
  projectType: true,
  clientName: true,
  clientCompany: true,
  status: true,
  startDate: true,
  targetCompletionDate: true,
  contractValue: true,
  revisedContractValue: true,
  projectedProfit: true,
  estimatedCost: true,
  createdAt: true,
} satisfies Prisma.ProjectSelect;

export async function listProjects(input: ListProjectsInput) {
  const search = input.search?.trim();
  const where = search && search.length > 0 ? projectSearchWhere(search) : undefined;

  return await prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: projectListSelect,
  });
}

export async function listProjectsForUser(input: {
  userId: string;
  canReadAll: boolean;
  search?: string;
}) {
  const search = input.search?.trim();
  const searchWhere = search && search.length > 0 ? projectSearchWhere(search) : undefined;

  const where: Prisma.ProjectWhereInput | undefined = input.canReadAll
    ? searchWhere
    : {
        AND: [
          { members: { some: { userId: input.userId } } },
          ...(searchWhere ? [searchWhere] : []),
        ],
      };

  return await prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: projectListSelect,
  });
}

export async function getProjectById(projectId: string) {
  return await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      milestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }] },
      roleAssignments: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }] },
      progressLogs: { orderBy: { logDate: "desc" } },
    },
  });
}

export type CreateProjectInput = {
  projectCode?: string;
  name: string;
  projectType: string;
  status?: ProjectStatus;
  quotationStatus?: QuotationStatus;
  contractStatus?: ContractStatus;
  billingStatus?: BillingStatus;
  clientName: string;
  clientCompany?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  siteAddress: string;
  startDate?: Date | null;
  targetCompletionDate?: Date | null;
  actualCompletionDate?: Date | null;
  contractValue: number;
  revisedContractValue: number;
  estimatedCost: number;
  committedCost: number;
  actualCost: number;
  notes?: string | null;
  // Legacy fields still used by other modules.
  addressLine1: string;
  addressLine2?: string | null;
  postalCode?: string | null;
  propertyType: "HDB" | "CONDO" | "LANDED" | "COMMERCIAL" | "OTHER";
  unitSizeSqft?: number | null;
};

export async function createProject(input: CreateProjectInput) {
  const projectCode = input.projectCode?.trim() || generateProjectCode();

  const projectedProfit = computeProjectedProfit({
    contractValue: input.contractValue,
    revisedContractValue: input.revisedContractValue,
    estimatedCost: input.estimatedCost,
  });
  const actualProfit = computeActualProfit({
    contractValue: input.contractValue,
    revisedContractValue: input.revisedContractValue,
    actualCost: input.actualCost,
  });

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        name: input.clientName,
        companyName: input.clientCompany ?? null,
        email: input.clientEmail ?? null,
        phone: input.clientPhone ?? null,
        mobile: input.clientPhone ?? null,
        addressLine1: null,
        addressLine2: null,
        postalCode: null,
        notes: null,
      },
    });

    const contact =
      input.clientEmail || input.clientPhone
        ? await tx.clientContact.create({
            data: {
              clientId: client.id,
              name: input.clientName,
              email: input.clientEmail ?? null,
              phone: input.clientPhone ?? null,
              roleTitle: "Client",
              isPrimary: true,
              notes: null,
            },
          })
        : null;

    const project = await tx.project.create({
      data: {
        clientId: client.id,
        primaryClientContactId: contact?.id ?? null,
        projectCode,
        name: input.name,
        clientName: input.clientName,
        clientCompany: input.clientCompany ?? null,
        clientEmail: input.clientEmail ?? null,
        clientPhone: input.clientPhone ?? null,
        siteAddress: input.siteAddress,
        projectType: input.projectType,
        status: input.status ?? ProjectStatus.LEAD,
        quotationStatus: input.quotationStatus ?? QuotationStatus.DRAFT,
        contractStatus: input.contractStatus ?? ContractStatus.DRAFT,
        billingStatus: input.billingStatus ?? BillingStatus.NOT_BILLED,
        startDate: input.startDate ?? null,
        targetCompletionDate: input.targetCompletionDate ?? null,
        actualCompletionDate: input.actualCompletionDate ?? null,
        contractValue: asDecimal(input.contractValue),
        revisedContractValue: asDecimal(input.revisedContractValue),
        estimatedCost: asDecimal(input.estimatedCost),
        committedCost: asDecimal(input.committedCost),
        actualCost: asDecimal(input.actualCost),
        projectedProfit: asDecimal(projectedProfit),
        actualProfit: asDecimal(actualProfit),
        notes: input.notes ?? null,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        postalCode: input.postalCode ?? null,
        propertyType: input.propertyType,
        unitSizeSqft:
          input.unitSizeSqft === null || input.unitSizeSqft === undefined
            ? null
            : new Prisma.Decimal(input.unitSizeSqft),
        contactPerson: input.clientName,
        contactPhone: input.clientPhone ?? null,
        contactEmail: input.clientEmail ?? null,
      },
    });

    return { project, client };
  });

  return result;
}

export type UpdateProjectInput = Partial<Omit<CreateProjectInput, "propertyType">> & {
  projectId: string;
  propertyType?: "HDB" | "CONDO" | "LANDED" | "COMMERCIAL" | "OTHER";
};

export async function updateProject(input: UpdateProjectInput) {
  const existing = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      clientId: true,
      primaryClientContactId: true,
      contractValue: true,
      revisedContractValue: true,
      estimatedCost: true,
      actualCost: true,
    },
  });
  if (!existing) return null;

  const contractValue =
    input.contractValue ?? Number(existing.contractValue ?? new Prisma.Decimal(0));
  const revisedContractValue =
    input.revisedContractValue ?? Number(existing.revisedContractValue ?? new Prisma.Decimal(0));
  const estimatedCost =
    input.estimatedCost ?? Number(existing.estimatedCost ?? new Prisma.Decimal(0));
  const actualCost = input.actualCost ?? Number(existing.actualCost ?? new Prisma.Decimal(0));

  const projectedProfit = computeProjectedProfit({
    contractValue,
    revisedContractValue,
    estimatedCost,
  });
  const actualProfit = computeActualProfit({
    contractValue,
    revisedContractValue,
    actualCost,
  });

  const updatedProject = await prisma.$transaction(async (tx) => {
    let primaryContactId = existing.primaryClientContactId ?? null;

    if ((input.clientEmail || input.clientPhone || input.clientName) && !primaryContactId) {
      const created = await tx.clientContact.create({
        data: {
          clientId: existing.clientId,
          name: input.clientName ?? "Client",
          email: input.clientEmail ?? null,
          phone: input.clientPhone ?? null,
          roleTitle: "Client",
          isPrimary: true,
          notes: null,
        },
        select: { id: true },
      });
      primaryContactId = created.id;
    } else if (primaryContactId && (input.clientEmail || input.clientPhone || input.clientName)) {
      await tx.clientContact.update({
        where: { id: primaryContactId },
        data: {
          name: input.clientName ?? undefined,
          email: input.clientEmail ?? undefined,
          phone: input.clientPhone ?? undefined,
        },
      });
    }

    const project = await tx.project.update({
      where: { id: existing.id },
      data: {
        primaryClientContactId: primaryContactId ?? undefined,
        projectCode: input.projectCode ?? undefined,
        name: input.name ?? undefined,
        clientName: input.clientName ?? undefined,
        clientCompany: input.clientCompany ?? undefined,
        clientEmail: input.clientEmail ?? undefined,
        clientPhone: input.clientPhone ?? undefined,
        siteAddress: input.siteAddress ?? undefined,
        projectType: input.projectType ?? undefined,
        status: input.status ?? undefined,
        quotationStatus: input.quotationStatus ?? undefined,
        contractStatus: input.contractStatus ?? undefined,
        billingStatus: input.billingStatus ?? undefined,
        startDate: input.startDate ?? undefined,
        targetCompletionDate: input.targetCompletionDate ?? undefined,
        actualCompletionDate: input.actualCompletionDate ?? undefined,
        contractValue:
          input.contractValue === undefined ? undefined : asDecimal(input.contractValue),
        revisedContractValue:
          input.revisedContractValue === undefined
            ? undefined
            : asDecimal(input.revisedContractValue),
        estimatedCost:
          input.estimatedCost === undefined ? undefined : asDecimal(input.estimatedCost),
        committedCost:
          input.committedCost === undefined ? undefined : asDecimal(input.committedCost),
        actualCost: input.actualCost === undefined ? undefined : asDecimal(input.actualCost),
        projectedProfit: asDecimal(projectedProfit),
        actualProfit: asDecimal(actualProfit),
        notes: input.notes ?? undefined,
        addressLine1: input.addressLine1 ?? undefined,
        addressLine2: input.addressLine2 ?? undefined,
        postalCode: input.postalCode ?? undefined,
        propertyType: input.propertyType ?? undefined,
        unitSizeSqft:
          input.unitSizeSqft === undefined
            ? undefined
            : input.unitSizeSqft === null
              ? null
              : new Prisma.Decimal(input.unitSizeSqft),
        contactPerson: input.clientName ?? undefined,
        contactPhone: input.clientPhone ?? undefined,
        contactEmail: input.clientEmail ?? undefined,
      },
    });

    await tx.client.update({
      where: { id: existing.clientId },
      data: {
        name: input.clientName ?? undefined,
        companyName: input.clientCompany ?? undefined,
        email: input.clientEmail ?? undefined,
        phone: input.clientPhone ?? undefined,
        mobile: input.clientPhone ?? undefined,
      },
    });

    return project;
  });

  return updatedProject;
}

export type CreateMilestoneInput = {
  projectId: string;
  title: string;
  description?: string | null;
  dueDate?: Date | null;
  status?: MilestoneStatus;
  sortOrder?: number;
};

export async function createMilestone(input: CreateMilestoneInput) {
  return await prisma.projectMilestone.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      status: input.status ?? MilestoneStatus.PLANNED,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export type CreateTaskInput = {
  projectId: string;
  milestoneId?: string | null;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  assignedEmail?: string | null;
  roleResponsible?: ProjectRole | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  progressPercent?: number;
  remarks?: string | null;
};

export async function createTask(input: CreateTaskInput) {
  return await prisma.projectTask.create({
    data: {
      projectId: input.projectId,
      milestoneId: input.milestoneId ?? null,
      title: input.title,
      description: input.description ?? null,
      assignedTo: input.assignedTo ?? null,
      assignedEmail: input.assignedEmail ?? null,
      roleResponsible: input.roleResponsible ?? null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      status: input.status ?? TaskStatus.TODO,
      priority: input.priority ?? TaskPriority.MEDIUM,
      progressPercent: Math.max(0, Math.min(100, Math.floor(input.progressPercent ?? 0))),
      remarks: input.remarks ?? null,
    },
  });
}

export type CreateProgressLogInput = {
  projectId: string;
  logDate: Date;
  title: string;
  description: string;
  progressPercent: number;
  delayReason?: string | null;
  createdBy: string;
};

export async function createProgressLog(input: CreateProgressLogInput) {
  return await prisma.projectProgressLog.create({
    data: {
      projectId: input.projectId,
      logDate: input.logDate,
      title: input.title,
      description: input.description,
      progressPercent: Math.max(0, Math.min(100, Math.floor(input.progressPercent))),
      delayReason: input.delayReason ?? null,
      createdBy: input.createdBy,
    },
  });
}

export type CreateRoleAssignmentInput = {
  projectId: string;
  userName: string;
  userEmail: string;
  role: ProjectRole;
};

export async function createRoleAssignment(input: CreateRoleAssignmentInput) {
  return await prisma.projectRoleAssignment.create({
    data: {
      projectId: input.projectId,
      userName: input.userName,
      userEmail: input.userEmail.toLowerCase(),
      role: input.role,
    },
  });
}
