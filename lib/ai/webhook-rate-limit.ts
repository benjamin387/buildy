import { NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 30;

type Bucket = {
  count: number;
  resetAt: number;
};

const bucketMap = new Map<string, Bucket>();

function resolveClientKey(req: NextRequest): string {
  const direct = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (direct) return direct;
  return req.headers.get("x-real-ip") ?? "ip:unknown";
}

function cleanupNow() {
  const now = Date.now();
  for (const [key, bucket] of bucketMap.entries()) {
    if (bucket.resetAt <= now) {
      bucketMap.delete(key);
    }
  }
}

export function resetWebhookRateLimits() {
  bucketMap.clear();
}

export function getRateLimitForWebhook(req: NextRequest, path: string): {
  ok: boolean;
  remaining: number;
  resetAt: number;
} {
  cleanupNow();

  const ip = resolveClientKey(req);
  const key = `${req.nextUrl.pathname}:${path}:${ip}`;
  const now = Date.now();
  const bucket = bucketMap.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const next: Bucket = {
      count: 1,
      resetAt: now + WINDOW_MS,
    };
    bucketMap.set(key, next);
    return { ok: true, remaining: LIMIT_PER_WINDOW - 1, resetAt: next.resetAt };
  }

  if (bucket.count >= LIMIT_PER_WINDOW) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { ok: true, remaining: LIMIT_PER_WINDOW - bucket.count, resetAt: bucket.resetAt };
}
