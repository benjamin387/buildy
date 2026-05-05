import { redirect } from "next/navigation";

export default async function UserAccessAliasPage(props: { params: Promise<{ userId: string }> }) {
  const { userId } = await props.params;
  redirect(`/settings/users/${userId}`);
}
