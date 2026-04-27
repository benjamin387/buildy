"use server";

import { z } from "zod";
import { Permission, ProjectRole, ProjectStatus, TaskPriority, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  createMilestone,
  createProgressLog,
  createProject,
  createRoleAssignment,
  createTask,
  updateProject,
} from "@/lib/projects/service";
import { auditLog, createRevision } from "@/lib/audit";
import { toRevisionJson } from "@/lib/audit/serialize";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const projectTypeSchema = z
  .string()
  .min(1)
  .max(60)
  .transform((v) => v.trim());

const createProjectSchema = z.object({
  projectCode: z.string().optional().or(z.literal("")).default(""),
  name: z.string().min(1).max(140),
  projectType: projectTypeSchema.default("OTHER"),
  status: z.nativeEnum(ProjectStatus).optional(),
  clientName: z.string().min(1).max(140),
  clientCompany: z.string().optional().or(z.literal("")).default(""),
  clientEmail: z.string().email().optional().or(z.literal("")).default(""),
  clientPhone: z.string().optional().or(z.literal("")).default(""),
  siteAddress: z.string().min(1).max(240),
  propertyType: z.enum(["HDB", "CONDO", "LANDED", "COMMERCIAL", "OTHER"]),
  postalCode: z.string().optional().or(z.literal("")).default(""),
  startDate: z.string().optional().or(z.literal("")).default(""),
  targetCompletionDate: z.string().optional().or(z.literal("")).default(""),
  contractValue: z.coerce.number().min(0).default(0),
  revisedContractValue: z.coerce.number().min(0).default(0),
  estimatedCost: z.coerce.number().min(0).default(0),
  committedCost: z.coerce.number().min(0).default(0),
  actualCost: z.coerce.number().min(0).default(0),
  notes: z.string().optional().or(z.literal("")).default(""),
  unitSizeSqft: z.coerce.number().min(0).optional().default(0),
});

export async function createProjectAction(formData: FormData) {
  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE });

  const parsed = createProjectSchema.safeParse({
    projectCode: formData.get("projectCode"),
    name: formData.get("name"),
    projectType: formData.get("projectType"),
    status: formData.get("status"),
    clientName: formData.get("clientName"),
    clientCompany: formData.get("clientCompany"),
    clientEmail: formData.get("clientEmail"),
    clientPhone: formData.get("clientPhone"),
    siteAddress: formData.get("siteAddress"),
    propertyType: formData.get("propertyType"),
    postalCode: formData.get("postalCode"),
    startDate: formData.get("startDate"),
    targetCompletionDate: formData.get("targetCompletionDate"),
    contractValue: formData.get("contractValue"),
    revisedContractValue: formData.get("revisedContractValue"),
    estimatedCost: formData.get("estimatedCost"),
    committedCost: formData.get("committedCost"),
    actualCost: formData.get("actualCost"),
    notes: formData.get("notes"),
    unitSizeSqft: formData.get("unitSizeSqft"),
  });

  if (!parsed.success) {
    throw new Error("Invalid project input.");
  }

  const { project } = await createProject({
    projectCode: parsed.data.projectCode || undefined,
    name: parsed.data.name,
    projectType: parsed.data.projectType,
    status: parsed.data.status ?? ProjectStatus.LEAD,
    clientName: parsed.data.clientName,
    clientCompany: parsed.data.clientCompany || null,
    clientEmail: parsed.data.clientEmail ? parsed.data.clientEmail.toLowerCase() : null,
    clientPhone: parsed.data.clientPhone || null,
    siteAddress: parsed.data.siteAddress,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
    targetCompletionDate: parsed.data.targetCompletionDate
      ? new Date(parsed.data.targetCompletionDate)
      : null,
    actualCompletionDate: null,
    contractValue: parsed.data.contractValue,
    revisedContractValue: parsed.data.revisedContractValue,
    estimatedCost: parsed.data.estimatedCost,
    committedCost: parsed.data.committedCost,
    actualCost: parsed.data.actualCost,
    notes: parsed.data.notes || null,
    addressLine1: parsed.data.siteAddress,
    addressLine2: null,
    postalCode: parsed.data.postalCode || null,
    propertyType: parsed.data.propertyType,
    unitSizeSqft: parsed.data.unitSizeSqft || 0,
  });

  const existingProfile = await prisma.projectCommercialProfile.findUnique({
    where: { projectId: project.id },
    select: { id: true },
  });
  if (!existingProfile) {
    await prisma.projectCommercialProfile.create({
      data: { projectId: project.id, status: "LEAD" },
    });
  }

  await prisma.projectTimelineItem.create({
    data: {
      projectId: project.id,
      type: "NOTE",
      title: "Project created",
      description: `Created by ${parsed.data.clientName}`,
      createdById: userId,
      metadata: { projectCode: project.projectCode },
    },
  });

  await auditLog({
    module: "project",
    action: "create",
    actorUserId: userId,
    projectId: project.id,
    entityType: "Project",
    entityId: project.id,
    metadata: { projectCode: project.projectCode, status: project.status },
  });

  await createRevision({
    entityType: "Project",
    entityId: project.id,
    projectId: project.id,
    actorUserId: userId,
    note: "Project created",
    data: toRevisionJson(project),
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

const updateProjectSchema = createProjectSchema.extend({
  projectId: z.string().min(1),
  actualCompletionDate: z.string().optional().or(z.literal("")).default(""),
});

export async function updateProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const { userId } = await requirePermission({
    permission: Permission.PROJECT_WRITE,
    projectId,
  });

  const parsed = updateProjectSchema.safeParse({
    projectId,
    projectCode: formData.get("projectCode"),
    name: formData.get("name"),
    projectType: formData.get("projectType"),
    status: formData.get("status"),
    clientName: formData.get("clientName"),
    clientCompany: formData.get("clientCompany"),
    clientEmail: formData.get("clientEmail"),
    clientPhone: formData.get("clientPhone"),
    siteAddress: formData.get("siteAddress"),
    propertyType: formData.get("propertyType"),
    postalCode: formData.get("postalCode"),
    startDate: formData.get("startDate"),
    targetCompletionDate: formData.get("targetCompletionDate"),
    actualCompletionDate: formData.get("actualCompletionDate"),
    contractValue: formData.get("contractValue"),
    revisedContractValue: formData.get("revisedContractValue"),
    estimatedCost: formData.get("estimatedCost"),
    committedCost: formData.get("committedCost"),
    actualCost: formData.get("actualCost"),
    notes: formData.get("notes"),
    unitSizeSqft: formData.get("unitSizeSqft"),
  });
  if (!parsed.success) throw new Error("Invalid project input.");

  const updated = await updateProject({
    projectId,
    projectCode: parsed.data.projectCode || undefined,
    name: parsed.data.name,
    projectType: parsed.data.projectType,
    status: parsed.data.status ?? undefined,
    clientName: parsed.data.clientName,
    clientCompany: parsed.data.clientCompany || null,
    clientEmail: parsed.data.clientEmail ? parsed.data.clientEmail.toLowerCase() : null,
    clientPhone: parsed.data.clientPhone || null,
    siteAddress: parsed.data.siteAddress,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
    targetCompletionDate: parsed.data.targetCompletionDate
      ? new Date(parsed.data.targetCompletionDate)
      : null,
    actualCompletionDate: parsed.data.actualCompletionDate
      ? new Date(parsed.data.actualCompletionDate)
      : null,
    contractValue: parsed.data.contractValue,
    revisedContractValue: parsed.data.revisedContractValue,
    estimatedCost: parsed.data.estimatedCost,
    committedCost: parsed.data.committedCost,
    actualCost: parsed.data.actualCost,
    notes: parsed.data.notes || null,
    addressLine1: parsed.data.siteAddress,
    postalCode: parsed.data.postalCode || null,
    propertyType: parsed.data.propertyType,
    unitSizeSqft: parsed.data.unitSizeSqft || 0,
  });

  if (!updated) {
    throw new Error("Project not found.");
  }

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: "Project updated",
      description: `Updated by ${userId}`,
      createdById: userId,
      metadata: { projectCode: updated.projectCode, status: updated.status },
    },
  });

  await auditLog({
    module: "project",
    action: "update",
    actorUserId: userId,
    projectId,
    entityType: "Project",
    entityId: projectId,
    metadata: { projectCode: updated.projectCode, status: updated.status },
  });

  await createRevision({
    entityType: "Project",
    entityId: projectId,
    projectId,
    actorUserId: userId,
    note: "Project updated",
    data: toRevisionJson(updated),
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

const createMilestoneSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(140),
  description: z.string().optional().or(z.literal("")).default(""),
  dueDate: z.string().optional().or(z.literal("")).default(""),
});

export async function createMilestoneAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const { userId } = await requirePermission({
    permission: Permission.PROJECT_WRITE,
    projectId,
  });

  const parsed = createMilestoneSchema.safeParse({
    projectId,
    title: formData.get("title"),
    description: formData.get("description"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) throw new Error("Invalid milestone input.");

  const milestone = await createMilestone({
    projectId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    sortOrder: 0,
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "MILESTONE",
      title: `Milestone created: ${milestone.title}`,
      createdById: userId,
      metadata: { milestoneId: milestone.id },
    },
  });

  await auditLog({
    module: "project",
    action: "milestone_create",
    actorUserId: userId,
    projectId,
    entityType: "ProjectMilestone",
    entityId: milestone.id,
    metadata: { title: milestone.title },
  });

  await createRevision({
    entityType: "ProjectMilestone",
    entityId: milestone.id,
    projectId,
    actorUserId: userId,
    note: "Milestone created",
    data: toRevisionJson(milestone),
  });

  revalidatePath(`/projects/${projectId}`);
}

const createTaskSchema = z.object({
  projectId: z.string().min(1),
  milestoneId: z.string().optional().or(z.literal("")).default(""),
  title: z.string().min(1).max(160),
  description: z.string().optional().or(z.literal("")).default(""),
  assignedTo: z.string().optional().or(z.literal("")).default(""),
  assignedEmail: z.string().email().optional().or(z.literal("")).default(""),
  roleResponsible: z.nativeEnum(ProjectRole).optional(),
  startDate: z.string().optional().or(z.literal("")).default(""),
  dueDate: z.string().optional().or(z.literal("")).default(""),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  progressPercent: z.coerce.number().min(0).max(100).optional().default(0),
  remarks: z.string().optional().or(z.literal("")).default(""),
});

export async function createTaskAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const { userId } = await requirePermission({
    permission: Permission.PROJECT_WRITE,
    projectId,
  });

  const parsed = createTaskSchema.safeParse({
    projectId,
    milestoneId: formData.get("milestoneId"),
    title: formData.get("title"),
    description: formData.get("description"),
    assignedTo: formData.get("assignedTo"),
    assignedEmail: formData.get("assignedEmail"),
    roleResponsible: formData.get("roleResponsible"),
    startDate: formData.get("startDate"),
    dueDate: formData.get("dueDate"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    progressPercent: formData.get("progressPercent"),
    remarks: formData.get("remarks"),
  });
  if (!parsed.success) throw new Error("Invalid task input.");

  const task = await createTask({
    projectId,
    milestoneId: parsed.data.milestoneId ? parsed.data.milestoneId : null,
    title: parsed.data.title,
    description: parsed.data.description || null,
    assignedTo: parsed.data.assignedTo || null,
    assignedEmail: parsed.data.assignedEmail ? parsed.data.assignedEmail.toLowerCase() : null,
    roleResponsible: parsed.data.roleResponsible ?? null,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    status: parsed.data.status ?? TaskStatus.TODO,
    priority: parsed.data.priority ?? TaskPriority.MEDIUM,
    progressPercent: parsed.data.progressPercent ?? 0,
    remarks: parsed.data.remarks || null,
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `Task created: ${task.title}`,
      createdById: userId,
      metadata: { taskId: task.id, status: task.status, priority: task.priority },
    },
  });

  await auditLog({
    module: "project",
    action: "task_create",
    actorUserId: userId,
    projectId,
    entityType: "ProjectTask",
    entityId: task.id,
    metadata: { title: task.title, status: task.status, priority: task.priority },
  });

  await createRevision({
    entityType: "ProjectTask",
    entityId: task.id,
    projectId,
    actorUserId: userId,
    note: "Task created",
    data: toRevisionJson(task),
  });

  revalidatePath(`/projects/${projectId}`);
}

const createProgressLogSchema = z.object({
  projectId: z.string().min(1),
  logDate: z.string().min(1),
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(4000),
  progressPercent: z.coerce.number().min(0).max(100),
  delayReason: z.string().optional().or(z.literal("")).default(""),
});

export async function createProgressLogAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const { userId } = await requirePermission({
    permission: Permission.PROJECT_WRITE,
    projectId,
  });

  const parsed = createProgressLogSchema.safeParse({
    projectId,
    logDate: formData.get("logDate"),
    title: formData.get("title"),
    description: formData.get("description"),
    progressPercent: formData.get("progressPercent"),
    delayReason: formData.get("delayReason"),
  });
  if (!parsed.success) throw new Error("Invalid progress log input.");

  const log = await createProgressLog({
    projectId,
    logDate: new Date(parsed.data.logDate),
    title: parsed.data.title,
    description: parsed.data.description,
    progressPercent: parsed.data.progressPercent,
    delayReason: parsed.data.delayReason || null,
    createdBy: userId,
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `Progress log: ${log.title}`,
      createdById: userId,
      metadata: { progressLogId: log.id, progressPercent: log.progressPercent },
    },
  });

  await auditLog({
    module: "project",
    action: "progress_log_create",
    actorUserId: userId,
    projectId,
    entityType: "ProjectProgressLog",
    entityId: log.id,
    metadata: { progressPercent: log.progressPercent, delayReason: log.delayReason },
  });

  await createRevision({
    entityType: "ProjectProgressLog",
    entityId: log.id,
    projectId,
    actorUserId: userId,
    note: "Progress log created",
    data: toRevisionJson(log),
  });

  revalidatePath(`/projects/${projectId}`);
}

const createRoleAssignmentSchema = z.object({
  projectId: z.string().min(1),
  userName: z.string().min(1).max(140),
  userEmail: z.string().email(),
  role: z.nativeEnum(ProjectRole),
});

export async function createRoleAssignmentAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const { userId } = await requirePermission({
    permission: Permission.PROJECT_WRITE,
    projectId,
  });

  const parsed = createRoleAssignmentSchema.safeParse({
    projectId,
    userName: formData.get("userName"),
    userEmail: formData.get("userEmail"),
    role: formData.get("role"),
  });
  if (!parsed.success) throw new Error("Invalid role assignment.");

  const assignment = await createRoleAssignment({
    projectId,
    userName: parsed.data.userName,
    userEmail: parsed.data.userEmail,
    role: parsed.data.role,
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `Role assigned: ${assignment.role}`,
      description: `${assignment.userName} (${assignment.userEmail})`,
      createdById: userId,
      metadata: { roleAssignmentId: assignment.id, role: assignment.role },
    },
  });

  await auditLog({
    module: "project",
    action: "role_assignment_create",
    actorUserId: userId,
    projectId,
    entityType: "ProjectRoleAssignment",
    entityId: assignment.id,
    metadata: { role: assignment.role, userEmail: assignment.userEmail },
  });

  await createRevision({
    entityType: "ProjectRoleAssignment",
    entityId: assignment.id,
    projectId,
    actorUserId: userId,
    note: "Role assignment created",
    data: toRevisionJson(assignment),
  });

  revalidatePath(`/projects/${projectId}`);
}
