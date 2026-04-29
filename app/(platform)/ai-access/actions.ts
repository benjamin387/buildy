"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiActionRequestStatus, AIChannel, type AiTool } from "@prisma/client";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createPairingCode, executeActionRequestNow } from "@/lib/ai/router";
import { executeApprovedActionRequest, setActionRequestApprovalState } from "@/lib/ai/action-approval";
import { listUserToolPermissions, setUserToolPermission, type ToolPermissionRow } from "@/lib/ai/tool-permissions";

const channelSchema = z.enum(["TELEGRAM", "WHATSAPP"]);
const actionRequestIdSchema = z.object({ id: z.string().trim().min(1) });

export type ToolPermissionFormRow = {
  tool: AiTool;
  isEnabled: boolean;
  requiresApproval: boolean;
};

function parseChannel(formData: FormData): AIChannel {
  const raw = String(formData.get("channel") ?? "").toUpperCase().trim();
  return channelSchema.parse(raw) as AIChannel;
}

export async function generateAiPairingCodeAction(formData: FormData) {
  const user = await requireUser();
  const channel = parseChannel(formData);

  const result = await createPairingCode(user.id, channel);
  revalidatePath("/ai-access/channels");
  revalidatePath("/ai-access");

  const next = new URL("/ai-access/channels", "http://localhost");
  next.searchParams.set("channel", channel);
  next.searchParams.set("pairingCode", result.code);
  next.searchParams.set("pairingCodeExpiresAt", result.expiresAt.toISOString());
  redirect(`${next.pathname}${next.search ? `?${next.searchParams.toString()}` : ""}`);
}

export async function revokeAiChannelAction(formData: FormData) {
  const user = await requireUser();
  const channel = parseChannel(formData);

  await prisma.aiUserChannel.updateMany({
    where: { userId: user.id, channel },
    data: {
      isVerified: false,
      pairingCodeHash: null,
      pairingCodeExpiresAt: null,
      externalUserId: "",
      displayName: null,
      phoneNumber: null,
      username: null,
      pairedAt: null,
    },
  });

  revalidatePath("/ai-access/channels");
  revalidatePath("/ai-access");
  redirect("/ai-access/channels?notice=channel_revoked&message=Channel+pairing+has+been+revoked.");
}

export async function saveAiPermissionsAction(formData: FormData) {
  const user = await requireUser();

  const rows = await listUserToolPermissions(user.id);

  const updates = rows.map((row) => {
    const enabled = formData.get(`tool_${row.tool}_isEnabled`) === "on";
    const requiresApproval = formData.get(`tool_${row.tool}_requiresApproval`) === "on";
    return setUserToolPermission({
      userId: user.id,
      tool: row.tool,
      isEnabled: enabled,
      requiresApproval,
    });
  });

  await Promise.all(updates);

  revalidatePath("/ai-access/permissions");
  revalidatePath("/ai-access");
  redirect("/ai-access/permissions?notice=permissions_saved&message=Permission+settings+saved.");
}

export async function executeAiActionRequestAction(formData: FormData) {
  const user = await requireUser();
  const parsed = actionRequestIdSchema.parse({ id: String(formData.get("id") ?? "") });

  const result = await executeActionRequestNow(parsed.id, user.id);
  revalidatePath("/ai-access/actions");
  revalidatePath(`/ai-access/actions/${parsed.id}`);

  const encodedMessage = encodeURIComponent(result.responseText || "Action handled");
  redirect(`/ai-access/actions/${parsed.id}?notice=action_${result.actionStatus.toString().toLowerCase()}&message=${encodedMessage}`);
}

export async function approveAiActionRequestAction(formData: FormData) {
  const user = await requireUser();
  const parsed = actionRequestIdSchema.parse({ id: String(formData.get("id") ?? "") });

  const result = await executeApprovedActionRequest({ actionRequestId: parsed.id, userId: user.id });

  revalidatePath("/ai-access/actions");
  revalidatePath(`/ai-access/actions/${parsed.id}`);

  if (result.status === AiActionRequestStatus.EXECUTED) {
    const encodedMessage = encodeURIComponent("Action approved and executed.");
    redirect(`/ai-access/actions/${parsed.id}?notice=action_executed&message=${encodedMessage}`);
  }

  if (result.status === AiActionRequestStatus.REJECTED) {
    const encodedMessage = encodeURIComponent("Approval page not found or already processed.");
    redirect(`/ai-access/actions?notice=action_rejected&message=${encodedMessage}`);
  }

  const encodedMessage = encodeURIComponent(result.message || "Action cannot be approved right now.");
  redirect(`/ai-access/actions/${parsed.id}?notice=action_${result.status.toString().toLowerCase()}&message=${encodedMessage}`);
}

export async function rejectAiActionRequestAction(formData: FormData) {
  const user = await requireUser();
  const parsed = actionRequestIdSchema.parse({ id: String(formData.get("id") ?? "") });

  const updated = await setActionRequestApprovalState({
    actionRequestId: parsed.id,
    userId: user.id,
    nextStatus: AiActionRequestStatus.REJECTED,
  });

  revalidatePath("/ai-access/actions");
  revalidatePath(`/ai-access/actions/${parsed.id}`);

  if (!updated) {
    redirect("/ai-access/actions?notice=action_not_found&message=Action+request+could+not+be+rejected.");
  }

  redirect(`/ai-access/actions/${parsed.id}?notice=action_rejected&message=Action+request+was+rejected.`);
}

export async function getActionPermissionsForUser(userId: string): Promise<ToolPermissionRow[]> {
  return listUserToolPermissions(userId);
}

export async function getActionRequestDetails(actionRequestId: string, userId: string) {
  return prisma.aiActionRequest.findFirst({
    where: { id: actionRequestId, userId },
  });
}
