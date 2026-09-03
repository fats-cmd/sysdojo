/**
 * Environment → validated configuration, as a pure function so the
 * production rules are unit-testable without spawning a server.
 *
 * The rule that matters: a production deploy that forgets a variable must
 * FAIL TO START, never silently fall back to a development default. Every
 * dev convenience here (a known JWT secret, credential-free login, the
 * in-memory store) is a full authentication bypass in production.
 */

/** The placeholder in .env.example — refused in production. */
export const DEV_JWT_SECRET = "dev-secret-change-me";

/** Short access-token life keeps a leaked token useful for minutes, not weeks. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh tokens rotate on every use, so a long life is safe and keeps
 *  daily-habit users signed in between sessions. */
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;

/** Minimum entropy we accept for the token-signing secret. */
const MIN_JWT_SECRET_LENGTH = 32;

export interface SupabaseConfig {
  /** Discovery endpoint for asymmetric (ES256/RS256) signing keys. */
  jwksUrl: string | null;
  /** Legacy shared HS256 secret. Supported, but deprecated by Supabase. */
  legacySecret: string | null;
  /** Expected `iss` claim: `${SUPABASE_URL}/auth/v1`. */
  issuer: string | null;
}

export interface AppConfig {
  nodeEnv: "production" | "development" | "test";
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  contentDir: string | null;
  databaseUrl: string | null;
  corsOrigin: string;
  /** POST /v1/auth/dev — credential-free login. Never true in production. */
  devLoginEnabled: boolean;
  supabase: SupabaseConfig | null;
  /** Express `trust proxy` setting, so rate limiting sees real client IPs. */
  trustProxy: boolean | number;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

function parseNodeEnv(raw: string | undefined): AppConfig["nodeEnv"] {
  return raw === "production" || raw === "test" ? raw : "development";
}

/** Strip a trailing slash so we can append paths without doubling up. */
function normalizeUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function parseTrustProxy(raw: string | undefined): boolean | number {
  if (raw === undefined || raw === "") return false;
  const hops = Number(raw);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  return raw === "true" || raw === "1";
}

/**
 * Validate the environment. Collects every problem before throwing so a
 * misconfigured deploy learns all of them from one failed boot.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const problems: string[] = [];
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  const isProduction = nodeEnv === "production";

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    problems.push(`PORT must be a valid port number (got ${JSON.stringify(env.PORT)})`);
  }

  // ---- token-signing secret ----
  const rawSecret = env.JWT_SECRET;
  let jwtSecret = rawSecret ?? DEV_JWT_SECRET;
  if (isProduction) {
    if (!rawSecret) {
      problems.push("JWT_SECRET is required in production (generate one: openssl rand -base64 48)");
    } else if (rawSecret === DEV_JWT_SECRET) {
      problems.push(
        "JWT_SECRET is still the .env.example placeholder — anyone can forge access tokens",
      );
    } else if (rawSecret.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(
        `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (got ${rawSecret.length})`,
      );
    }
    jwtSecret = rawSecret ?? "";
  }

  // ---- auth provider ----
  const supabaseUrl = env.SUPABASE_URL ? normalizeUrl(env.SUPABASE_URL) : null;
  const legacySecret = env.SUPABASE_JWT_SECRET || null;
  let supabase: SupabaseConfig | null = null;

  if (supabaseUrl || legacySecret) {
    if (supabaseUrl && !/^https?:\/\//.test(supabaseUrl)) {
      problems.push(`SUPABASE_URL must be an absolute http(s) URL (got ${supabaseUrl})`);
    }
    // Without SUPABASE_URL we cannot discover public keys or check `iss`,
    // so the legacy shared secret is the only thing left to verify with.
    if (!supabaseUrl && isProduction) {
      problems.push(
        "SUPABASE_URL is required in production so tokens can be verified against the " +
          "project's published signing keys and issuer",
      );
    }
    supabase = {
      jwksUrl: supabaseUrl ? `${supabaseUrl}/auth/v1/.well-known/jwks.json` : null,
      legacySecret,
      issuer: supabaseUrl ? `${supabaseUrl}/auth/v1` : null,
    };
  } else if (isProduction) {
    problems.push(
      "No auth provider configured — set SUPABASE_URL (and optionally SUPABASE_JWT_SECRET). " +
        "Production must never run on the dev auth adapter",
    );
  }

  // ---- persistence ----
  const databaseUrl = env.DATABASE_URL || null;
  if (isProduction && !databaseUrl) {
    problems.push("DATABASE_URL is required in production (the in-memory store loses all data)");
  }

  // ---- dev login ----
  // Hard off in production regardless of ALLOW_DEV_LOGIN: this endpoint
  // hands out a session for any display name, with no credential at all.
  const allowDevLoginRequested = env.ALLOW_DEV_LOGIN === "1";
  if (isProduction && allowDevLoginRequested) {
    problems.push(
      "ALLOW_DEV_LOGIN=1 is refused in production — /v1/auth/dev issues sessions without credentials",
    );
  }
  const devLoginEnabled = isProduction ? false : !supabase || allowDevLoginRequested;

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    nodeEnv,
    isProduction,
    port,
    jwtSecret,
    contentDir: env.CONTENT_DIR || null,
    databaseUrl,
    corsOrigin: env.CORS_ORIGIN || "*",
    devLoginEnabled,
    supabase,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  };
}
