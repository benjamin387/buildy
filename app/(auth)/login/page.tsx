import { redirect } from "next/navigation";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { DEFAULT_AUTH_REDIRECT, getSafeRedirectPath } from "@/lib/auth/redirect";
import { getSessionUser } from "@/lib/auth/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackParam = params.callbackUrl;
  const callbackUrl =
    typeof callbackParam === "string"
      ? getSafeRedirectPath(callbackParam, { fallback: DEFAULT_AUTH_REDIRECT })
      : DEFAULT_AUTH_REDIRECT;

  const user = await getSessionUser();
  if (user) {
    redirect(callbackUrl);
  }

  return <LoginForm callbackUrl={callbackUrl} />;
}
