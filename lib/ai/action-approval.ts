import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  AiActionRequestStatus,
  AIChannel,
  AiRiskLevel,
  AiTool,
  type Prisma,
} from "@prisma/client";
import { webSearch } from "@/lib/ai/tools/web-search";
import { gmailCreateDraft, gmailRead, gmailSearch, gmailSendDraft } from "@/lib/ai/tools/gmail";
import { calendarCreateEvent, calendarSearch, calendarUpdateEvent } from "@/lib/ai/tools/google-calendar";
import { logAiToolAttempt } from "@/lib/ai/audit";

const ACTION_EXECUTION_TIMEOUT_MS = 12000;

export type ActionToolInput = Prisma.JsonValue;

export type ActionResult = {
  ok: boolean;
  status: AiActionRequestStatus;
  result?: unknown;
  error?: string;
};

export const APPROVAL_EXPIRES_MINUTES = 10;

export function generateActionApprovalToken(): string {
  return randomBytes(18).toString("hex");
}

export async function createActionApprovalRequest(params: {
  userId: string;
  conversationId: string;
  tool: AiTool;
  actionType: string;
  riskLevel: AiRiskLevel;
  input: ActionToolInput;
  expiresAt?: Date | null;
}): Promise<{ id: string; approvalToken: string | null }> {
  const approvalToken = generateActionApprovalToken();
  const record = await prisma.aiActionRequest.create({
    data: {
      userId: params.userId,
      conversationId: params.conversationId,
      tool: params.tool,
      actionType: params.actionType,
      status: AiActionRequestStatus.PENDING,
      input: params.input as Prisma.InputJsonValue,
      riskLevel: params.riskLevel,
      approvalToken,
      expiresAt:
        params.expiresAt ?? new Date(Date.now() + APPROVAL_EXPIRES_MINUTES * 60 * 1000),
    },
    select: { id: true, approvalToken: true },
  });

  return { id: record.id, approvalToken: record.approvalToken };
}

export async function setActionRequestApprovalState(params: {
  actionRequestId: string;
  userId: string;
  nextStatus: "REJECTED" | "APPROVED";
}): Promise<{ id: string; status: AiActionRequestStatus } | null> {
  const row = await prisma.aiActionRequest.findFirst({
    where: {
      id: params.actionRequestId,
      userId: params.userId,
      status: AiActionRequestStatus.PENDING,
    },
    select: { id: true },
  });

  if (!row) return null;

  const updated = await prisma.aiActionRequest.update({
    where: { id: params.actionRequestId },
    data: {
      status: params.nextStatus,
      ...(params.nextStatus === AiActionRequestStatus.REJECTED ? { result: { rejectedAt: new Date().toISOString() } as Prisma.JsonObject } : {}),
    },
    select: { id: true, status: true },
  });

  return {
    id: updated.id,
    status: updated.status,
  };
}

export async function getActionRequestWithContext(actionRequestId: string, userId: string) {
  return prisma.aiActionRequest.findFirst({
    where: {
      id: actionRequestId,
      userId,
    },
  });
}

export async function markActionRequestExpired(): Promise<number> {
  const updated = await prisma.aiActionRequest.updateMany({
    where: {
      status: AiActionRequestStatus.PENDING,
      expiresAt: { not: null, lt: new Date() },
    },
    data: {
      status: AiActionRequestStatus.FAILED,
      result: { reason: "approval expired" } as Prisma.JsonObject,
    },
  });

  return updated.count;
}

export async function executeActionTool(params: {
  userId: string;
  channel: AIChannel;
  actionRequestId: string;
  tool: AiTool;
  actionType: string;
  input: Prisma.JsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<ActionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ACTION_EXECUTION_TIMEOUT_MS);
  const safeActionType = params.actionType.toLowerCase();
  try {
    let result: any;
    if (params.tool === AiTool.WEB_SEARCH) {
      const query = typeof (params.input as any)?.query === "string" ? String((params.input as any).query) : "";
      result = await webSearch(query);
    } else if (params.tool === AiTool.GMAIL_READ) {
      if (safeActionType === "gmail_search") {
        const query = typeof (params.input as any)?.query === "string" ? String((params.input as any).query) : "";
        result = await gmailSearch(query);
      } else {
        const messageId =
          typeof (params.input as any)?.messageId === "string" ? String((params.input as any).messageId) : null;
        result = await gmailRead(messageId);
      }
    } else if (params.tool === AiTool.GMAIL_DRAFT) {
      const to = typeof (params.input as any)?.to === "string" ? String((params.input as any).to) : null;
      const subject = typeof (params.input as any)?.subject === "string" ? String((params.input as any).subject) : null;
      const body = typeof (params.input as any)?.body === "string" ? String((params.input as any).body) : null;
      result = await gmailCreateDraft(to, subject, body);
    } else if (params.tool === AiTool.GMAIL_SEND) {
      const draftId =
        typeof (params.input as any)?.draftId === "string"
          ? String((params.input as any).draftId)
          : typeof (params.input as any)?.id === "string"
            ? String((params.input as any).id)
            : null;
      result = await gmailSendDraft(draftId);
    } else if (params.tool === AiTool.CALENDAR_READ) {
      const input = params.input as any;
      const query = input && typeof input === "object" && typeof input.query === "string" ? input.query : "";
      result = await calendarSearch(query);
    } else if (params.tool === AiTool.CALENDAR_WRITE) {
      if (safeActionType === "calendar_update_event") {
        const eventId = typeof (params.input as any)?.eventId === "string" ? String((params.input as any).eventId) : null;
        const updates =
          typeof (params.input as any)?.update === "string" ? String((params.input as any).update) : "Update requested";
        result = await calendarUpdateEvent({ eventId, updates });
      } else {
        const title =
          typeof (params.input as any)?.title === "string" ? String((params.input as any).title) : "Calendar event";
        const whenRaw =
          typeof (params.input as any)?.when === "string" ? String((params.input as any).when) : "";
        const start =
          typeof (params.input as any)?.start === "string" ? String((params.input as any).start) : whenRaw || new Date().toISOString();
        const end =
          typeof (params.input as any)?.end === "string" ? String((params.input as any).end) :
          new Date(new Date(start).getTime() + 3600000).toISOString();
        const description =
          typeof (params.input as any)?.description === "string" ? String((params.input as any).description) : null;

        result = await calendarCreateEvent({
          title,
          start,
          end,
          description,
          attendeeEmails: Array.isArray((params.input as any)?.attendeeEmails) ? (params.input as any).attendeeEmails : undefined,
        });
      }
    } else {
      return { ok: false, status: AiActionRequestStatus.FAILED, error: `Unsupported tool ${params.tool}` };
    }

    await prisma.aiActionRequest.update({
      where: { id: params.actionRequestId },
      data: {
        status: result?.ok ? AiActionRequestStatus.EXECUTED : AiActionRequestStatus.FAILED,
        result: result as Prisma.InputJsonValue,
      },
    });

    await logAiToolAttempt({
      userId: params.userId,
      channel: params.channel,
      tool: params.tool,
      action: `${params.tool}:${params.actionType}`,
      input: params.input,
      status: result?.ok ? "executed" : "failed",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    if (!result?.ok) {
      return {
        ok: false,
        status: AiActionRequestStatus.FAILED,
        result,
        error: result.error ?? "Tool execution failed.",
      };
    }

    return {
      ok: true,
      status: AiActionRequestStatus.EXECUTED,
      result,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown tool execution error";
    await prisma.aiActionRequest.update({
      where: { id: params.actionRequestId },
      data: {
        status: AiActionRequestStatus.FAILED,
        result: { error: msg, executedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });

    await logAiToolAttempt({
      userId: params.userId,
      channel: params.channel,
      tool: params.tool,
      action: `${params.tool}:${params.actionType}`,
      input: params.input,
      status: "failed",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return { ok: false, status: AiActionRequestStatus.FAILED, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeApprovedActionRequest(params: {
  actionRequestId: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ status: AiActionRequestStatus; result?: unknown; message?: string }> {
  const request = await prisma.aiActionRequest.findFirst({
    where: {
      id: params.actionRequestId,
      userId: params.userId,
      status: AiActionRequestStatus.PENDING,
    },
    select: {
      id: true,
      tool: true,
      actionType: true,
      input: true,
      conversationId: true,
      expiresAt: true,
    },
  });

  if (!request) {
    return { status: AiActionRequestStatus.REJECTED, message: "Action request not found or not pending." };
  }

  if (request.expiresAt && request.expiresAt.getTime() < Date.now()) {
    await prisma.aiActionRequest.update({
      where: { id: request.id },
      data: {
        status: AiActionRequestStatus.FAILED,
        result: { expiredAt: new Date().toISOString(), reason: "Approval window expired" } as Prisma.JsonObject,
      },
    });
    return { status: AiActionRequestStatus.FAILED, message: "Action request expired." };
  }

  const row = await prisma.aiActionRequest.update({
    where: { id: request.id },
    data: { status: AiActionRequestStatus.APPROVED },
  });

  const channelRow = await prisma.aiConversation.findUnique({
    where: { id: row.conversationId },
    select: { channel: true },
  });

  if (!channelRow) {
    return { status: AiActionRequestStatus.FAILED, message: "Conversation context missing." };
  }

  const result = await executeActionTool({
    userId: params.userId,
    channel: channelRow.channel,
    actionRequestId: request.id,
    tool: row.tool,
    actionType: row.actionType,
    input: request.input,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return { status: result.status, result: result.result, message: result.error };
}
