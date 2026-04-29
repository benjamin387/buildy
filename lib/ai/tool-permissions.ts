import "server-only";

import { prisma } from "@/lib/prisma";
import { AiTool, type Prisma } from "@prisma/client";

export type ToolPermissionInput = {
  userId: string;
  tool: AiTool;
  isEnabled: boolean;
  requiresApproval: boolean;
};

export type ToolPermissionRow = {
  id: string;
  userId: string;
  tool: AiTool;
  isEnabled: boolean;
  requiresApproval: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const DEFAULT_TOOL_PERMISSIONS: Array<{ tool: AiTool; isEnabled: boolean; requiresApproval: boolean }> = [
  { tool: AiTool.WEB_SEARCH, isEnabled: false, requiresApproval: false },
  { tool: AiTool.GMAIL_READ, isEnabled: false, requiresApproval: false },
  { tool: AiTool.GMAIL_DRAFT, isEnabled: false, requiresApproval: false },
  { tool: AiTool.GMAIL_SEND, isEnabled: false, requiresApproval: true },
  { tool: AiTool.CALENDAR_READ, isEnabled: false, requiresApproval: false },
  { tool: AiTool.CALENDAR_WRITE, isEnabled: false, requiresApproval: true },
];

function toToolPermissionRow(row: Prisma.AiToolPermissionGetPayload<Record<string, never>>): ToolPermissionRow {
  return {
    id: row.id,
    userId: row.userId,
    tool: row.tool,
    isEnabled: row.isEnabled,
    requiresApproval: row.requiresApproval,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function seedMissingToolPermissions(userId: string, existing: ToolPermissionRow[]): Promise<void> {
  const missing = DEFAULT_TOOL_PERMISSIONS.filter((d) => !existing.some((e) => e.tool === d.tool));

  if (missing.length === 0) {
    return;
  }

  await prisma.$transaction(
    missing.map((entry) =>
      prisma.aiToolPermission.upsert({
        where: {
          userId_tool: {
            userId,
            tool: entry.tool,
          },
        },
        create: {
          userId,
          tool: entry.tool,
          isEnabled: entry.isEnabled,
          requiresApproval: entry.requiresApproval,
        },
        update: {
          isEnabled: entry.isEnabled,
          requiresApproval: entry.requiresApproval,
        },
      }),
    ),
  );
}

export async function ensureUserAiToolPermissions(userId: string): Promise<ToolPermissionRow[]> {
  const existing = await prisma.aiToolPermission.findMany({
    where: { userId },
    orderBy: { tool: "asc" },
  });

  const typed = existing.map(toToolPermissionRow);
  await seedMissingToolPermissions(userId, typed);

  return prisma.aiToolPermission.findMany({
    where: { userId },
    orderBy: { tool: "asc" },
  }).then((rows) => rows.map(toToolPermissionRow));
}

export async function listUserToolPermissions(userId: string): Promise<ToolPermissionRow[]> {
  return ensureUserAiToolPermissions(userId);
}

export async function getUserToolPermission(userId: string, tool: AiTool): Promise<ToolPermissionRow> {
  await ensureUserAiToolPermissions(userId);
  const found = await prisma.aiToolPermission.findFirst({
    where: { userId, tool },
  });

  if (!found) {
    const fallback = DEFAULT_TOOL_PERMISSIONS.find((entry) => entry.tool === tool);
    if (!fallback) {
      throw new Error(`Missing tool permission entry for ${tool}.`);
    }

    const seeded = await prisma.aiToolPermission.create({
      data: {
        userId,
        tool,
        isEnabled: fallback.isEnabled,
        requiresApproval: fallback.requiresApproval,
      },
    });
    return toToolPermissionRow(seeded);
  }

  return toToolPermissionRow(found);
}

export async function setUserToolPermission(params: ToolPermissionInput): Promise<ToolPermissionRow> {
  const row = await prisma.aiToolPermission.upsert({
    where: {
      userId_tool: {
        userId: params.userId,
        tool: params.tool,
      },
    },
    create: {
      userId: params.userId,
      tool: params.tool,
      isEnabled: params.isEnabled,
      requiresApproval: params.requiresApproval,
    },
    update: {
      isEnabled: params.isEnabled,
      requiresApproval: params.requiresApproval,
    },
  });

  return toToolPermissionRow(row);
}
