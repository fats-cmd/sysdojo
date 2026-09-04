import { fileURLToPath } from "node:url";
import type { ContentQuestion } from "@sysdojo/shared";
import { FakeAuthAdapter } from "./auth/adapter";
import { SupabaseAuthAdapter } from "./auth/supabase-adapter";
import { ConfigError, loadConfig } from "./config";
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

// Validate the whole environment before anything else. In production a
// missing or placeholder secret is a hard stop, never a silent fallback.
let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) {
    log.error(`refusing to start with NODE_ENV=${process.env.NODE_ENV ?? "development"}:`);
    for (const problem of err.problems) log.error(`  - ${problem}`);
    log.error("→ see .env.example for every variable and how to generate secrets");
    process.exit(1);
  }
  throw err;
}

const contentDir =
  config.contentDir ?? fileURLToPath(new URL("../../../content", import.meta.url));

log.info(`starting api (node ${process.version}, pid ${process.pid}, env ${config.nodeEnv})`);
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
// to the in-memory dev store (data resets on restart). Production requires it.
const storeKind = config.databaseUrl ? "postgres" : "memory";
let store: Store;

if (config.databaseUrl) {
  const target = redactDatabaseUrl(config.databaseUrl);
  log.info(`DATABASE_URL set — using postgres store (${target})`);
  const db = createPrismaClient(config.databaseUrl);

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

// A Supabase project selects the real auth provider; without one the API runs
// in dev mode where any device can sign in (impossible in production).
const authAdapter = config.supabase
  ? new SupabaseAuthAdapter({
      jwksUrl: config.supabase.jwksUrl,
      legacySecret: config.supabase.legacySecret,
      issuer: config.supabase.issuer,
    })
  : new FakeAuthAdapter();

if (config.supabase) {
  const modes = [
    config.supabase.jwksUrl ? "asymmetric (JWKS)" : null,
    config.supabase.legacySecret ? "legacy HS256 secret" : null,
  ].filter(Boolean);
  log.info(`auth: supabase — verifying ${modes.join(" + ")}`);
  if (!config.supabase.jwksUrl) {
    log.warn(
      "auth: only the legacy shared secret is configured. Set SUPABASE_URL to verify " +
        "against rotatable public keys and to pin the token issuer.",
    );
  }
  if (config.devLoginEnabled) log.warn("auth: /v1/auth/dev is ENABLED (ALLOW_DEV_LOGIN=1)");
} else {
  log.warn("auth: dev mode — any device can sign in (set SUPABASE_URL for real auth)");
}

if (config.isProduction && config.corsOrigin === "*") {
  log.warn(
    "CORS_ORIGIN is unset, so any website can call this API from a browser. " +
      "The API is token-authed with no cookies, so this is not an account risk, " +
      "but set CORS_ORIGIN to your web origin if you serve Expo web.",
  );
}

// Expired refresh tokens can no longer authenticate anyone; sweep them so the
// table doesn't grow forever. Hourly is plenty for a once-a-day app.
const REFRESH_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const sweep = setInterval(() => {
  store
    .deleteExpiredRefreshTokens(new Date())
    .then((removed) => {
      if (removed > 0) log.info(`pruned ${removed} expired refresh tokens`);
    })
    .catch((err: unknown) => log.error("refresh token sweep failed:", err));
}, REFRESH_SWEEP_INTERVAL_MS);
sweep.unref();

const app = createApp({
  store,
  storeKind,
  questions,
  authAdapter,
  jwtSecret: config.jwtSecret,
  logRequests: true,
  corsOrigin: config.corsOrigin,
  devLoginEnabled: config.devLoginEnabled,
  trustProxy: config.trustProxy,
});

const server = app.listen(config.port, () => {
  log.info(`listening on http://localhost:${config.port} (${storeKind} store)`);
  log.info(`probe from this machine:   curl http://localhost:${config.port}/health`);
  log.info(`from a phone, use your LAN IP via EXPO_PUBLIC_API_URL (see .env.example)`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    log.error(
      `port ${config.port} is already in use — is another dev:api running? (set PORT to change)`,
    );
  } else {
    log.error("server failed to start:", err);
  }
  process.exit(1);
});
