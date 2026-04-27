export const DEFAULT_AUTH_REDIRECT = "/dashboard";

export function isSafeRelativeRedirectPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

export function getSafeRedirectPath(
  value: string | null | undefined,
  options: { fallback?: string; origin?: string } = {},
): string {
  const fallback = options.fallback ?? DEFAULT_AUTH_REDIRECT;

  if (!value) {
    return fallback;
  }

  if (isSafeRelativeRedirectPath(value)) {
    return value;
  }

  if (!options.origin) {
    return fallback;
  }

  try {
    const baseUrl = new URL(options.origin);
    const resolvedUrl = new URL(value, baseUrl);

    if (resolvedUrl.origin !== baseUrl.origin) {
      return fallback;
    }

    const relativePath = `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
    return isSafeRelativeRedirectPath(relativePath) ? relativePath : fallback;
  } catch {
    return fallback;
  }
}
