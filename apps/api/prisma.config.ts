import { defineConfig } from "prisma/config";
import { loadDotEnv } from "./src/env";

// Prisma 7 does not read .env itself; load it the same way the API does so
// `npm run db:migrate` works after `cp .env.example .env`. Shell env wins.
loadDotEnv();

const url = process.env.DATABASE_URL;

// datasource.url is intentionally optional so `prisma generate` (run on
// postinstall) works without a database configured — but migrate needs it.
if (!url && process.argv.some((a) => a.includes("migrate"))) {
  console.error(
    "[sysdojo] DATABASE_URL is not set. Export it in your shell or put it in a " +
      ".env file at the repo root (see .env.example), then re-run this command.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(url ? { datasource: { url } } : {}),
});
