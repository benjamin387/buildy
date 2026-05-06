import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Serverless-friendly pool sizing. On Vercel each lambda instance gets its own
// pg.Pool, so a high `max` multiplied by concurrent invocations will exhaust
// Postgres connection slots. DATABASE_URL is expected to point at a
// transaction-mode pooler (Supabase pgbouncer :6543, Neon pooler, PgBouncer,
// etc.); migrations should use a separate DIRECT_URL.
const POOL_MAX = Number(process.env.PRISMA_POOL_MAX ?? 1);
const POOL_IDLE_MS = Number(process.env.PRISMA_POOL_IDLE_MS ?? 20_000);
const POOL_CONNECT_MS = Number(process.env.PRISMA_POOL_CONNECT_MS ?? 10_000);

function createClient() {
  const adapter = new PrismaPg({
    connectionString,
    max: POOL_MAX,
    idleTimeoutMillis: POOL_IDLE_MS,
    connectionTimeoutMillis: POOL_CONNECT_MS,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function isClientStale(client: PrismaClient | undefined): boolean {
  // After schema changes, a hot-reloaded Next.js dev server can keep a cached PrismaClient instance
  // that was created from an older generated client (missing delegates). Detect and recreate safely.
  const c = client as any;
  return (
    !c ||
    typeof c !== "object" ||
    typeof c.proposal?.findUnique !== "function" ||
    typeof c.gebizFeedSource?.findMany !== "function" ||
    typeof c.gebizOpportunity?.findMany !== "function" ||
    typeof c.bizsafeProfile?.findUnique !== "function"
  );
}

const cached = globalForPrisma.prisma;
const stale = isClientStale(cached);

if (stale && cached && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.warn("[prisma] Detected stale cached Prisma client (missing generated delegates). Recreating client.");
}

export const prisma = !stale ? cached! : createClient();

// Cache across module reloads in dev AND across warm-lambda invocations in
// production — without this, every Server Action import path could create a
// fresh PrismaClient/Pool on Vercel.
globalForPrisma.prisma = prisma;
