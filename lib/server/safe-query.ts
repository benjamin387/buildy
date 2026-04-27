import "server-only";

export async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Keep server components resilient on fresh/empty DBs and optional modules.
    console.error("[safeQuery] failed:", err);
    return fallback;
  }
}

