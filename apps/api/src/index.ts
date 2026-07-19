import { fileURLToPath } from "node:url";
import type { ContentQuestion } from "@sysdojo/shared";
import { FakeAuthAdapter } from "./auth/adapter";
import { loadQuestions } from "./content/load";
import { syncQuestions } from "./content/sync";
import { loadDotEnv } from "./env";
import { log } from "./log";
import { createApp } from "./server";
import { MemoryStore } from "./store/memory-store";
import { createPrismaClient, PrismaStore } from "./store/prisma-store";
import type { Store } from "./store/store";

process.on("uncaughtException", (err) => {
  log.error("uncaught exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandled rejection:", reason);
  process.exit(1);
});

const envFile = loadDotEnv();

const port = Number(process.env.PORT ?? 3000);
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";
const contentDir =
  process.env.CONTENT_DIR ?? fileURLToPath(new URL("../../../content", import.meta.url));

log.info(`starting api (node ${process.version}, pid ${process.pid})`);
if (envFile) log.info(`loaded environment from ${envFile}`);
log.info(`loading content from ${contentDir}`);

let questions: ContentQuestion[];
try {
  questions = loadQuestions(contentDir);
  log.info(`loaded ${questions.length} questions`);
} catch (err) {
  log.error("content pack failed validation:", err instanceof Error ? err.message : err);
  process.exit(1);
}

/** host:port/db without credentials, safe to log. */
function redactDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

function prismaErrorCode(err: unknown): string | null {
  return typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
    ? err.code
    : null;
}

// DATABASE_URL selects Postgres persistence; without it the API falls back
// to the in-memory dev store (data resets on restart).
const databaseUrl = process.env.DATABASE_URL;
const storeKind = databaseUrl ? "postgres" : "memory";
let store: Store;

if (databaseUrl) {
  const target = redactDatabaseUrl(databaseUrl);
  log.info(`DATABASE_URL set — using postgres store (${target})`);
  const db = createPrismaClient(databaseUrl);

  try {
    const seeded = await db.question.count();
    log.info(`postgres reachable, ${seeded} questions currently in the database`);
  } catch (err) {
    const code = prismaErrorCode(err);
    if (code === "P1001") {
      log.error(`cannot reach postgres at ${target}`);
      log.error("→ start it:            docker compose up -d db");
      log.error("→ or use the in-memory dev store by unsetting DATABASE_URL");
    } else if (code === "P2021" || code === "P2010") {
      log.error("postgres is reachable but the schema is missing or out of date");
      log.error("→ run migrations:      npm run db:migrate -w @sysdojo/api");
    } else if (code === "P1000") {
      log.error(`postgres rejected the credentials in DATABASE_URL (${target})`);
      log.error("→ check user/password against docker-compose.yml / your database");
    } else if (code === "P1003") {
      log.error(`the database named in DATABASE_URL does not exist (${target})`);
      log.error("→ check the name against POSTGRES_DB in docker-compose.yml");
    } else {
      log.error("unexpected database error during startup:", err);
    }
    process.exit(1);
  }

  await syncQuestions(db, questions);
  log.info(`synced ${questions.length} content questions into postgres`);
  store = new PrismaStore(db);
} else {
  log.info("DATABASE_URL not set — using in-memory store (data resets on restart)");
  store = new MemoryStore();
}

const app = createApp({
  store,
  storeKind,
  questions,
  authAdapter: new FakeAuthAdapter(),
  jwtSecret,
  logRequests: true,
  corsOrigin: process.env.CORS_ORIGIN,
});

const server = app.listen(port, () => {
  log.info(`listening on http://localhost:${port} (${storeKind} store)`);
  log.info(`probe from this machine:   curl http://localhost:${port}/health`);
  log.info(`from a phone, use your LAN IP via EXPO_PUBLIC_API_URL (see .env.example)`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    log.error(`port ${port} is already in use — is another dev:api running? (set PORT to change)`);
  } else {
    log.error("server failed to start:", err);
  }
  process.exit(1);
});
