import { notFound, redirect } from "next/navigation";
import { consumePortalToken } from "@/lib/client-portal/service";
import { setClientPortalSession } from "@/lib/client-portal/session";

export const dynamic = "force-dynamic";

export default async function ClientAccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const consumed = await consumePortalToken(token);
  if (!consumed) notFound();

  await setClientPortalSession(consumed.accountId);
  redirect("/client/portal");
}

