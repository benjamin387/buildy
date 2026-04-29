import { prisma } from "@/lib/prisma";
import { logAiToolAttempt } from "@/lib/ai/audit";
import {
  createActionApprovalRequest,
  executeActionTool,
  executeApprovedActionRequest,
} from "@/lib/ai/action-approval";
import { AiActionRequestStatus, AIChannel, AiMessageRole, AiRiskLevel, AiTool, type Prisma } from "@prisma/client";
import { inferOpenClawIntent, toOpenClawContext } from "@/lib/ai/openclaw-agent";
import { getUserToolPermission } from "@/lib/ai/tool-permissions";
import { logAiAudit } from "@/lib/ai/audit";
import { createHash, randomBytes } from "node:crypto";

export type AiRouterInput = {
  channel: AIChannel;
  externalUserId: string;
  externalThreadId: string;
  rawText: string;
  requestContext: {
    ipAddress?: string | null;
    userAgent?: string | null;
  };
};

export type AiRouterResult = {
  conversationId: string;
  responseText: string;
  actionRequestId: string | null;
  actionStatus: AiActionRequestStatus | "CHAT";
};

export type RouterMessageWithRole = Pick<Prisma.AiMessageGetPayload<any>, "role" | "content">;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function deriveConversationTitle(message: string): string {
  const trimmed = message.replaceAll(/\s+/g, " ").trim();
  return trimmed.length > 75 ? `${trimmed.slice(0, 75)}…` : trimmed || "AI conversation";
}

function summarizeToolResult(tool: AiTool, result: unknown): string {
  if (!result || typeof result !== "object") {
    return "No structured response was returned.";
  }

  const obj = result as Record<string, any>;
  if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();

  if (tool === AiTool.WEB_SEARCH && Array.isArray(obj.results)) {
    const lines = obj.results
      .slice(0, 3)
      .map((r: any) => `${r.title ?? "Result"}: ${(r.url || "").toString()}`)
      .join("\n");
    return lines || "Search completed.";
  }

  if (tool === AiTool.GMAIL_DRAFT && obj.data && typeof obj.data === "object") {
    const draft = obj.data as any;
    return draft?.id ? `Draft created (${draft.id}).` : "Draft action completed.";
  }

  if ((tool === AiTool.CALENDAR_WRITE || tool === AiTool.CALENDAR_READ) && Array.isArray(obj.data)) {
    return obj.data.length
      ? `Calendar returned ${obj.data.length} item(s).`
      : `${tool === AiTool.CALENDAR_READ ? "Calendar search" : "Calendar action"} completed.`;
  }

  return "Action completed. Response recorded in audit log.";
}

export async function findOrCreateChannelConversation(params: {
  userId: string;
  channel: AIChannel;
  externalThreadId: string;
  titleHint: string;
}): Promise<string> {
  const existing = await prisma.aiConversation.findUnique({
    where: {
      userId_channel_externalThreadId: {
        userId: params.userId,
        channel: params.channel,
        externalThreadId: params.externalThreadId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.aiConversation.update({
      where: { id: existing.id },
      data: { lastMessageAt: new Date() },
    });
    return existing.id;
  }

  const conversation = await prisma.aiConversation.create({
    data: {
      userId: params.userId,
      channel: params.channel,
      externalThreadId: params.externalThreadId,
      title: params.titleHint,
    },
  });

  return conversation.id;
}

function isApprovalRequired(tool: AiTool, actionType: string, requiresApproval: boolean): boolean {
  if (tool === AiTool.GMAIL_SEND || tool === AiTool.CALENDAR_WRITE) {
    return requiresApproval;
  }
  if (actionType === "gmail_send_draft" || actionType === "calendar_update_event") {
    return requiresApproval;
  }
  return false;
}

function defaultRiskLevel(tool: AiTool): AiRiskLevel {
  if (tool === AiTool.GMAIL_SEND || tool === AiTool.CALENDAR_WRITE) return AiRiskLevel.HIGH;
  if (tool === AiTool.CALENDAR_READ || tool === AiTool.GMAIL_DRAFT || tool === AiTool.WEB_SEARCH || tool === AiTool.GMAIL_READ)
    return AiRiskLevel.LOW;
  return AiRiskLevel.MEDIUM;
}

export async function ensurePairedChannel(params: {
  channel: AIChannel;
  externalUserId: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  username?: string | null;
}): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const channel = await prisma.aiUserChannel.findFirst({
    where: {
      channel: params.channel,
      externalUserId: params.externalUserId,
      isVerified: true,
    },
    select: {
      id: true,
      userId: true,
      phoneNumber: true,
      displayName: true,
      username: true,
      lastSeenAt: true,
    },
  });

  if (!channel) return { ok: false, error: "Channel is not paired yet." };

  await prisma.aiUserChannel.update({
    where: { id: channel.id },
    data: {
      lastSeenAt: new Date(),
      displayName: params.displayName ?? channel.displayName,
      phoneNumber: params.phoneNumber ?? channel.phoneNumber,
      username: params.username ?? channel.username,
    },
  });

  return { ok: true, userId: channel.userId };
}

export async function pairChannelByCode(params: {
  channel: AIChannel;
  code: string;
  externalUserId: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  username?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const codeHash = pairCodeHash(params.code);
  const now = new Date();

  const row = await prisma.aiUserChannel.findFirst({
    where: {
      channel: params.channel,
      pairingCodeHash: codeHash,
      isVerified: false,
      pairingCodeExpiresAt: { not: null, gt: now },
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!row) {
    return { ok: false, message: "Invalid or expired pairing code." };
  }

  await prisma.aiUserChannel.update({
    where: { id: row.id },
    data: {
      externalUserId: params.externalUserId,
      displayName: params.displayName ?? null,
      phoneNumber: params.phoneNumber ?? null,
      username: params.username ?? null,
      isVerified: true,
      pairingCodeHash: null,
      pairingCodeExpiresAt: null,
      pairedAt: now,
      lastSeenAt: now,
    },
  });

  return { ok: true, message: "Channel paired successfully." };
}

async function resolveChannelByExternalIdentity(params: {
  channel: AIChannel;
  externalUserId: string;
}): Promise<{ ok: false; userId: null } | { ok: true; userId: string }> {
  const found = await prisma.aiUserChannel.findFirst({
    where: {
      channel: params.channel,
      externalUserId: params.externalUserId,
      isVerified: true,
    },
    select: { userId: true },
  });

  if (!found) return { ok: false, userId: null };
  return { ok: true, userId: found.userId };
}

function pairCodeHash(code: string): string {
  const trimmed = code.trim().toUpperCase();
  return createHash("sha256").update(trimmed).digest("hex");
}

export function generatePairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

export async function createPairingCode(userId: string, channel: AIChannel): Promise<{ code: string; expiresAt: Date }> {
  const code = generatePairingCode();
  const hash = pairCodeHash(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const existing = await prisma.aiUserChannel.findFirst({
    where: { userId, channel },
    select: { id: true },
  });

  if (existing) {
    await prisma.aiUserChannel.update({
      where: { id: existing.id },
      data: {
        pairingCodeHash: hash,
        pairingCodeExpiresAt: expiresAt,
        isVerified: false,
      },
    });
    return { code, expiresAt };
  }

  await prisma.aiUserChannel.create({
    data: {
      userId,
      channel,
      externalUserId: "",
      isVerified: false,
      pairingCodeHash: hash,
      pairingCodeExpiresAt: expiresAt,
    },
  });

  return { code, expiresAt };
}

export async function routeAiMessage(params: AiRouterInput): Promise<AiRouterResult> {
  const normalized = normalizeText(params.rawText);
  if (!normalized) {
    return {
      conversationId: "",
      responseText: "No message text was provided.",
      actionRequestId: null,
      actionStatus: "CHAT",
    };
  }

  const identity = await resolveChannelByExternalIdentity({
    channel: params.channel,
    externalUserId: params.externalUserId,
  });

  if (!identity.ok) {
    const pairPrompt = params.channel === AIChannel.WHATSAPP
      ? "Send 'PAIR CODE' to pair your account."
      : "Send '/pair CODE' to pair your account.";

    return {
      conversationId: "",
      responseText: `This channel is not paired. ${pairPrompt}`,
      actionRequestId: null,
      actionStatus: AiActionRequestStatus.REJECTED,
    };
  }

  const conversationId = await findOrCreateChannelConversation({
    userId: identity.userId,
    channel: params.channel,
    externalThreadId: params.externalThreadId,
    titleHint: deriveConversationTitle(normalized),
  });

  await prisma.aiMessage.create({
    data: {
      conversationId,
      role: AiMessageRole.USER,
      content: normalized,
    },
  });

  const recentMessages = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 8,
    select: { role: true, content: true },
  });

  const context = toOpenClawContext(recentMessages as RouterMessageWithRole[]);

  const intent = await inferOpenClawIntent(`${normalized}\n\nContext:\n${context}`);

  if (intent.mode === "chat") {
    const assistantText = intent.chatResponse;
    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: AiMessageRole.ASSISTANT,
        content: assistantText,
      },
    });

    return {
      conversationId,
      responseText: assistantText,
      actionRequestId: null,
      actionStatus: "CHAT",
    };
  }

  const permission = await getUserToolPermission(identity.userId, intent.tool);
  if (!permission.isEnabled) {
    const blockedText = `Tool ${intent.tool} is currently disabled for your profile.`;
    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: AiMessageRole.ASSISTANT,
        content: blockedText,
      },
    });
    await logAiAudit({
      userId: identity.userId,
      channel: params.channel,
      tool: intent.tool,
      action: intent.actionType,
      inputSummary: intent.summary,
      status: "tool_disabled",
      ipAddress: params.requestContext.ipAddress,
      userAgent: params.requestContext.userAgent,
    });

    return {
      conversationId,
      actionRequestId: null,
      responseText: blockedText,
      actionStatus: AiActionRequestStatus.REJECTED,
    };
  }

  const requiresApproval = isApprovalRequired(intent.tool, intent.actionType, permission.requiresApproval);
  const risk = defaultRiskLevel(intent.tool);

  const actionRequest = await createActionApprovalRequest({
    userId: identity.userId,
    conversationId,
    tool: intent.tool,
    actionType: intent.actionType,
    input: {
      ...intent.input,
      rawText: normalized,
    },
    riskLevel: risk,
    // Keep request id for optional audit chain.
  });

  if (requiresApproval) {
    const responseText =
      `Approval required. Open this approval page: /ai-access/actions/${actionRequest.id}`;

    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: AiMessageRole.ASSISTANT,
        content: responseText,
        metadata: {
          approvalRequested: true,
          actionRequestId: actionRequest.id,
          tool: intent.tool,
          actionType: intent.actionType,
        } as Prisma.InputJsonValue,
      },
    });

    await logAiToolAttempt({
      userId: identity.userId,
      channel: params.channel,
      tool: intent.tool,
      action: `${intent.tool}:${intent.actionType}`,
      input: {
        ...intent.input,
        rawText: normalized,
      },
      status: "approval_required",
      ipAddress: params.requestContext.ipAddress,
      userAgent: params.requestContext.userAgent,
    });

    return {
      conversationId,
      actionRequestId: actionRequest.id,
      responseText,
      actionStatus: AiActionRequestStatus.PENDING,
    };
  }

  const executed = await executeActionTool({
    userId: identity.userId,
    channel: params.channel,
    actionRequestId: actionRequest.id,
    tool: intent.tool,
    actionType: intent.actionType,
    input: {
      ...intent.input,
      rawText: normalized,
    },
    ipAddress: params.requestContext.ipAddress,
    userAgent: params.requestContext.userAgent,
  });

  const reply = executed.ok
    ? summarizeToolResult(intent.tool, executed.result)
    : `Tool execution failed. ${executed.error ?? "Please review action logs."}`;

  await prisma.aiMessage.create({
    data: {
      conversationId,
      role: AiMessageRole.ASSISTANT,
      content: reply,
      metadata: {
        tool: intent.tool,
        actionType: intent.actionType,
        executed: executed.ok,
        actionRequestId: actionRequest.id,
      } as Prisma.InputJsonValue,
    },
  });

  await logAiToolAttempt({
    userId: identity.userId,
    channel: params.channel,
    tool: intent.tool,
    action: `${intent.tool}:${intent.actionType}`,
    input: {
      ...intent.input,
      rawText: normalized,
    },
    status: executed.ok ? "completed" : "failed",
    ipAddress: params.requestContext.ipAddress,
    userAgent: params.requestContext.userAgent,
  });

  return {
    conversationId,
    actionRequestId: actionRequest.id,
    responseText: reply,
    actionStatus: executed.ok ? AiActionRequestStatus.EXECUTED : AiActionRequestStatus.FAILED,
  };
}

export async function executeActionRequestNow(actionRequestId: string, userId: string): Promise<AiRouterResult> {
  const request = await prisma.aiActionRequest.findUnique({
    where: { id: actionRequestId },
    select: { conversationId: true, userId: true, tool: true, actionType: true, input: true, status: true },
  });

  if (!request || request.userId !== userId) {
    return {
      conversationId: "",
      actionRequestId: null,
      actionStatus: AiActionRequestStatus.REJECTED,
      responseText: "Action request not found.",
    };
  }

  if (request.status !== AiActionRequestStatus.PENDING) {
    return {
      conversationId: request.conversationId,
      actionRequestId,
      actionStatus: request.status,
      responseText: `Action request is already ${request.status.toLowerCase()}.`,
    };
  }

  const result = await executeApprovedActionRequest({
    actionRequestId,
    userId,
  });

  return {
    conversationId: request.conversationId,
    actionRequestId,
    actionStatus: result.status,
    responseText: result.status === AiActionRequestStatus.EXECUTED
      ? summarizeToolResult(request.tool, result.result)
      : result.message ?? "Execution failed.",
  };
}

export async function isActionRequestPending(userId: string, actionRequestId: string): Promise<boolean> {
  const row = await prisma.aiActionRequest.findFirst({
    where: { id: actionRequestId, userId, status: AiActionRequestStatus.PENDING },
    select: { id: true },
  });
  return Boolean(row);
}
