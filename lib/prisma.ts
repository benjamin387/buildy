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

const adapter = new PrismaPg({ connectionString });

function createClient() {
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function isClientStale(client: PrismaClient | undefined): boolean {
  // After schema changes, a hot-reloaded Next.js dev server can keep a cached PrismaClient instance
  // that was created from an older generated client (missing delegates). Detect and recreate safely.
  const c = client as any;
  return !c || typeof c !== "object" || typeof c.gebizFeedSource?.findMany !== "function";
}

const cached = globalForPrisma.prisma;
const stale = isClientStale(cached);

if (stale && cached && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.warn("[prisma] Detected stale cached Prisma client (missing GeBIZ delegates). Recreating client.");
}

export const prisma = !stale ? cached! : createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
