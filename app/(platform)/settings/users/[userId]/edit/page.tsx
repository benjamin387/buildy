import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/rbac/admin";

export default async function UserEditRedirectPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requirePlatformAdmin();
  const { userId } = await params;
  redirect(`/settings/users/${userId}`);
}

