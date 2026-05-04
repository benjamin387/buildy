import "server-only";

/**
 * Retry a finder function on null, with a small delay. Mitigates the
 * Supabase pooler / Prisma adapter-pg read-after-write visibility window
 * where a freshly-committed row sometimes isn't visible to the very next
 * read on a different pooled connection.
 *
 * Defaults: 2 retries with 150ms then 300ms delays. Worst-case added
 * latency is ~450ms, only on the first read of a newly-created row.
 * Returns whatever the last attempt produced (which can still be null —
 * the caller decides how to handle that).
 */
export async function findOrRetry<T>(
  finder: () => Promise<T | null>,
  options?: { retries?: number; baseDelayMs?: number },
): Promise<T | null> {
  const retries = Math.max(0, options?.retries ?? 2);
  const baseDelayMs = Math.max(0, options?.baseDelayMs ?? 150);

  let result = await finder();
  for (let attempt = 0; attempt < retries && result === null; attempt++) {
    const delay = baseDelayMs * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = await finder();
  }
  return result;
}
