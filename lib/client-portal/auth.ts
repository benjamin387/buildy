import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientPortalSessionAccountId } from "@/lib/client-portal/session";
import { requirePortalProjectAccess } from "@/lib/client-portal/service";

export async function requireClientPortalAccount() {
  const accountId = await getClientPortalSessionAccountId();
  if (!accountId) redirect("/client/login");

  const account = await prisma.clientPortalAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) redirect("/client/login");

  return account;
}

export async function requireClientPortalProject(params: { projectId: string }) {
  const accountId = await getClientPortalSessionAccountId();
  if (!accountId) redirect("/client/login");

  const access = await requirePortalProjectAccess({ accountId, projectId: params.projectId });
  if (!access) redirect("/client/portal");

  return access;
}

