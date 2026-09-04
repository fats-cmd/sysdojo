import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { JwksClient } from "../src/auth/jwks";
import { SupabaseAuthAdapter } from "../src/auth/supabase-adapter";
import { HttpError } from "../src/errors";

const LEGACY_SECRET = "supabase-test-secret";
const ISSUER = "https://abc.supabase.co/auth/v1";

// --- asymmetric key material, as Supabase publishes it ---
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "key-1", alg: "ES256", use: "sig" };

/** A fetch that serves our generated public key as a JWKS document. */
function jwksFetch(body: unknown = { keys: [publicJwk] }, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

function asymmetricAdapter(fetchImpl = jwksFetch()) {
  return new SupabaseAuthAdapter({
    issuer: ISSUER,
    jwksClient: new JwksClient("https://abc.supabase.co/auth/v1/.well-known/jwks.json", {
      fetchImpl,
    }),
  });
}

function es256Token(payload: object = {}, kid = "key-1", expiresIn = "1h"): string {
  return jwt.sign({ aud: "authenticated", ...payload }, privateKey, {
    algorithm: "ES256",
    keyid: kid,
    issuer: ISSUER,
    subject: "user-uuid-123",
    expiresIn,
  } as jwt.SignOptions);
}

function hs256Token(payload: object = {}, secret = LEGACY_SECRET, expiresIn = "1h"): string {
  return jwt.sign({ aud: "authenticated", ...payload }, secret, {
    issuer: ISSUER,
    subject: "user-uuid-123",
    expiresIn,
  } as jwt.SignOptions);
}

describe("SupabaseAuthAdapter — asymmetric (JWKS)", () => {
  it("verifies an ES256 token against the published public key", async () => {
    const identity = await asymmetricAdapter().authenticate({
      credential: es256Token({ user_metadata: { full_name: "Ada Lovelace" } }),
    });
    expect(identity.externalId).toBe("supabase:user-uuid-123");
    expect(identity.displayName).toBe("Ada Lovelace");
  });

  it("fetches the key set once and reuses it", async () => {
    const fetchImpl = jwksFetch();
    const adapter = asymmetricAdapter(fetchImpl);
    await adapter.authenticate({ credential: es256Token() });
    await adapter.authenticate({ credential: es256Token() });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a token signed by a different key pair", async () => {
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const forged = jwt.sign({ aud: "authenticated" }, other.privateKey, {
      algorithm: "ES256",
      keyid: "key-1",
      issuer: ISSUER,
      subject: "user-uuid-123",
      expiresIn: "1h",
    } as jwt.SignOptions);
    await expect(asymmetricAdapter().authenticate({ credential: forged })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects a token whose key id is not published", async () => {
    await expect(
      asymmetricAdapter().authenticate({ credential: es256Token({}, "unknown-kid") }),
    ).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIAL" });
  });

  it("rejects a token minted by a different Supabase project", async () => {
    const wrongIssuer = jwt.sign({ aud: "authenticated" }, privateKey, {
      algorithm: "ES256",
      keyid: "key-1",
      issuer: "https://attacker.supabase.co/auth/v1",
      subject: "user-uuid-123",
      expiresIn: "1h",
    } as jwt.SignOptions);
    await expect(
      asymmetricAdapter().authenticate({ credential: wrongIssuer }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("reports a 503, not a 401, when the JWKS endpoint is unreachable", async () => {
    // A provider outage must not look like a bad credential, or every client
    // would throw away a perfectly good session.
    const failing = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await expect(
      asymmetricAdapter(failing).authenticate({ credential: es256Token() }),
    ).rejects.toMatchObject({ status: 503, code: "AUTH_PROVIDER_UNAVAILABLE" });
  });

  it("refuses an HS256 token when only asymmetric keys are configured", async () => {
    // Algorithm confusion: a public key must never double as an HMAC secret.
    await expect(
      asymmetricAdapter().authenticate({ credential: hs256Token() }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("SupabaseAuthAdapter — legacy HS256 secret", () => {
  const adapter = new SupabaseAuthAdapter({ legacySecret: LEGACY_SECRET, issuer: ISSUER });

  it("accepts a valid token and derives identity from metadata name", async () => {
    const identity = await adapter.authenticate({
      credential: hs256Token({ user_metadata: { full_name: "Ada Lovelace" } }),
    });
    expect(identity.externalId).toBe("supabase:user-uuid-123");
    expect(identity.displayName).toBe("Ada Lovelace");
  });

  it("falls back to the email prefix, then a default", async () => {
    const byEmail = await adapter.authenticate({
      credential: hs256Token({ email: "grace@navy.mil" }),
    });
    expect(byEmail.displayName).toBe("grace");

    const bare = await adapter.authenticate({ credential: hs256Token() });
    expect(bare.displayName).toBe("Learner");
  });

  it("prefers an explicitly provided displayName", async () => {
    const identity = await adapter.authenticate({
      credential: hs256Token({ user_metadata: { full_name: "Ignored" } }),
      displayName: "Chosen Name",
    });
    expect(identity.displayName).toBe("Chosen Name");
  });

  it("rejects a missing credential", async () => {
    await expect(adapter.authenticate({})).rejects.toMatchObject(
      new HttpError(401, "INVALID_CREDENTIAL", "Missing Supabase access token"),
    );
  });

  it("rejects tokens signed with the wrong secret", async () => {
    await expect(
      adapter.authenticate({ credential: hs256Token({}, "attacker-secret") }),
    ).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIAL" });
  });

  it("rejects expired tokens", async () => {
    await expect(
      adapter.authenticate({ credential: hs256Token({}, LEGACY_SECRET, "-1h") }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects tokens without the authenticated audience", async () => {
    const anon = jwt.sign({ aud: "anon" }, LEGACY_SECRET, {
      issuer: ISSUER,
      subject: "user-uuid-123",
    });
    await expect(adapter.authenticate({ credential: anon })).rejects.toMatchObject({ status: 401 });
  });

  it("rejects an unsigned (alg: none) token", async () => {
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    )}.${Buffer.from(JSON.stringify({ sub: "x", aud: "authenticated" })).toString("base64url")}.`;
    await expect(adapter.authenticate({ credential: unsigned })).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("SupabaseAuthAdapter — construction", () => {
  it("refuses to exist with no way to verify anything", () => {
    expect(() => new SupabaseAuthAdapter({})).toThrow(/JWKS URL or a legacy JWT secret/);
  });
});
