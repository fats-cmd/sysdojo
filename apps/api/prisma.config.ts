import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env automatically: DATABASE_URL must be present
// in the environment when running `prisma migrate` commands (see .env.example).
// It is intentionally optional here so `prisma generate` (run on postinstall)
// works without a database configured.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(url ? { datasource: { url } } : {}),
});
