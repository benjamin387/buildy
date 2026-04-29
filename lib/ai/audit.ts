import { prisma } from "@/lib/prisma";
import { AIChannel, AiTool, type Prisma } from "@prisma/client";

export type AiAuditInput = {
  userId: string;
  channel: AIChannel;
  tool: AiTool;
  action: string;
  inputSummary: string;
  status: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function logAiAudit(params: AiAuditInput): Promise<void> {
  await prisma.aiAuditLog.create({
    data: {
      userId: params.userId,
      channel: params.channel,
      tool: params.tool,
      action: params.action,
      inputSummary: params.inputSummary,
      status: params.status,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  }).catch((error: unknown) => {
    console.error("[ai-audit] failed", error);
  });
}

function summarizeValue(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string") return value.slice(0, 300);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `${value.length} item(s)`;
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (objectValue.message) return String(objectValue.message).slice(0, 300);
    if (objectValue.title) return String(objectValue.title).slice(0, 300);
    const keys = Object.keys(objectValue);
    return keys.length > 0 ? `obj(${keys.join(",")})` : "{ }";
  }

  return "unsupported payload";
}

export function buildAiInputSummary(value: unknown): string {
  return summarizeValue(value);
}

export async function logAiToolAttempt(params: {
  userId: string;
  channel: AIChannel;
  tool: AiTool;
  action: string;
  input: unknown;
  status: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await logAiAudit({
    userId: params.userId,
    channel: params.channel,
    tool: params.tool,
    action: params.action,
    inputSummary: buildAiInputSummary(params.input),
    status: params.status,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}

export function summarizeRequestInput(data: Prisma.InputJsonValue | null | undefined): string {
  return buildAiInputSummary(data as unknown);
}
