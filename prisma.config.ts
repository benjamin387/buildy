import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Migrations run direct (not through pgbouncer transaction pool) — DDL needs
// a stable session. Fall back to DATABASE_URL when DIRECT_URL is absent.
const migrationUrl = process.env.DIRECT_URL ? env("DIRECT_URL") : env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl,
  },
});
