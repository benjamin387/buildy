import "server-only";

/**
 * Shared cron endpoint security.
 *
 * We accept the secret either via:
 * - `Authorization: Bearer <secret>` header
 * - `x-cron-secret` header (preferred)
 * - `?secret=` query param (fallback)
 *
 * All cron routes must rely on `CRON_SECRET` only.
 */
export function validateCronSecret(request: Request): Response | null {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) {
    return new Response("CRON_SECRET is not configured.", { status: 500 });
  }

  const auth = (request.headers.get("authorization") ?? "").trim();
  const bearer =
    auth.toLowerCase().startsWith("bearer ") ? auth.slice("bearer ".length).trim() : "";
  const providedHeader = (request.headers.get("x-cron-secret") ?? "").trim();
  const url = new URL(request.url);
  const providedQuery = (url.searchParams.get("secret") ?? "").trim();
  const provided = bearer || providedHeader || providedQuery;

  if (!provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}
