import { describe, expect, it } from "vitest";
import { ConfigError, DEV_JWT_SECRET, loadConfig } from "../src/config";

/**
 * The production rules are the whole point of this module: a deploy that
 * forgets a variable must fail to boot rather than fall back to a
 * development default that authenticates anybody.
 */

const STRONG_SECRET = "a".repeat(48);

/** A production environment with nothing missing. */
const prodEnv = {
  NODE_ENV: "production",
  JWT_SECRET: STRONG_SECRET,
  DATABASE_URL: "postgresql://u:p@db:5432/sysdojo",
  SUPABASE_URL: "https://abc.supabase.co",
};

function problemsFor(env: NodeJS.ProcessEnv): string[] {
  try {
    loadConfig(env);
    return [];
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
}

describe("loadConfig — development defaults", () => {
  it("boots with an empty environment", () => {
    const config = loadConfig({});
    expect(config.isProduction).toBe(false);
    expect(config.jwtSecret).toBe(DEV_JWT_SECRET);
    expect(config.databaseUrl).toBeNull();
    expect(config.supabase).toBeNull();
    // No real provider configured, so the dev endpoint is the only way in.
    expect(config.devLoginEnabled).toBe(true);
  });

  it("turns dev login off once a provider is configured", () => {
    const config = loadConfig({ SUPABASE_URL: "https://abc.supabase.co" });
    expect(config.devLoginEnabled).toBe(false);
  });

  it("lets ALLOW_DEV_LOGIN reopen it for local testing", () => {
    const config = loadConfig({
      SUPABASE_URL: "https://abc.supabase.co",
      ALLOW_DEV_LOGIN: "1",
    });
    expect(config.devLoginEnabled).toBe(true);
  });

  it("derives the JWKS url and issuer from SUPABASE_URL", () => {
    const config = loadConfig({ SUPABASE_URL: "https://abc.supabase.co/" });
    expect(config.supabase?.jwksUrl).toBe(
      "https://abc.supabase.co/auth/v1/.well-known/jwks.json",
    );
    expect(config.supabase?.issuer).toBe("https://abc.supabase.co/auth/v1");
  });
});

describe("loadConfig — production is fail-fast", () => {
  it("accepts a fully configured production environment", () => {
    const config = loadConfig(prodEnv);
    expect(config.isProduction).toBe(true);
    expect(config.devLoginEnabled).toBe(false);
    expect(config.jwtSecret).toBe(STRONG_SECRET);
  });

  it("refuses the placeholder signing secret", () => {
    const problems = problemsFor({ ...prodEnv, JWT_SECRET: DEV_JWT_SECRET });
    expect(problems.join(" ")).toMatch(/placeholder/i);
  });

  it("refuses a missing signing secret", () => {
    const { JWT_SECRET: _omitted, ...env } = prodEnv;
    expect(problemsFor(env).join(" ")).toMatch(/JWT_SECRET is required/);
  });

  it("refuses a short signing secret", () => {
    const problems = problemsFor({ ...prodEnv, JWT_SECRET: "too-short" });
    expect(problems.join(" ")).toMatch(/at least 32 characters/);
  });

  it("refuses to run without a real auth provider", () => {
    const { SUPABASE_URL: _omitted, ...env } = prodEnv;
    expect(problemsFor(env).join(" ")).toMatch(/No auth provider configured/);
  });

  it("refuses the legacy secret alone, which cannot pin an issuer", () => {
    const { SUPABASE_URL: _omitted, ...env } = prodEnv;
    const problems = problemsFor({ ...env, SUPABASE_JWT_SECRET: "legacy" });
    expect(problems.join(" ")).toMatch(/SUPABASE_URL is required in production/);
  });

  it("refuses to run on the in-memory store", () => {
    const { DATABASE_URL: _omitted, ...env } = prodEnv;
    expect(problemsFor(env).join(" ")).toMatch(/DATABASE_URL is required/);
  });

  it("refuses ALLOW_DEV_LOGIN outright", () => {
    const problems = problemsFor({ ...prodEnv, ALLOW_DEV_LOGIN: "1" });
    expect(problems.join(" ")).toMatch(/ALLOW_DEV_LOGIN=1 is refused/);
  });

  it("never enables dev login, even by accident", () => {
    // Same env minus the explicit opt-in: still off, because no provider
    // would otherwise flip it on in development.
    const config = loadConfig(prodEnv);
    expect(config.devLoginEnabled).toBe(false);
  });

  it("reports every problem at once rather than one per boot", () => {
    const problems = problemsFor({ NODE_ENV: "production" });
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe("loadConfig — proxy and port", () => {
  it("does not trust proxy headers by default", () => {
    expect(loadConfig({}).trustProxy).toBe(false);
  });

  it("accepts a hop count", () => {
    expect(loadConfig({ TRUST_PROXY: "1" }).trustProxy).toBe(1);
  });

  it("rejects a nonsense port", () => {
    expect(problemsFor({ PORT: "not-a-port" }).join(" ")).toMatch(/PORT must be/);
  });
});
