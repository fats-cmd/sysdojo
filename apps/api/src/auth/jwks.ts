import { createPublicKey, type KeyObject } from "node:crypto";

/**
 * Minimal JWKS client for verifying asymmetrically-signed provider tokens.
 *
 * Supabase publishes the *public* halves of its JWT signing keys at
 * `/auth/v1/.well-known/jwks.json`. Public keys can only verify signatures,
 * never mint tokens, so fetching them needs no secret and the result is
 * safe to cache. Node can import a JWK directly (`format: "jwk"`), so this
 * needs no third-party JWKS library.
 *
 * Keys rotate: a project can hold an active key plus standby/previous ones.
 * A `kid` we have never seen therefore means "refetch", not "reject" — but
 * we rate-limit that refetch so a flood of tokens carrying junk `kid`s
 * cannot turn into a flood of outbound requests.
 */

/** Signature algorithms we accept from a JWKS. Symmetric algs are excluded
 *  deliberately: a public key must never be usable as an HMAC secret. */
export const ASYMMETRIC_ALGORITHMS = [
  "ES256",
  "ES384",
  "ES512",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
] as const;

export type AsymmetricAlgorithm = (typeof ASYMMETRIC_ALGORITHMS)[number];

export function isAsymmetricAlgorithm(alg: string): alg is AsymmetricAlgorithm {
  return (ASYMMETRIC_ALGORITHMS as readonly string[]).includes(alg);
}

interface Jwk {
  kid?: string;
  kty?: string;
  use?: string;
  alg?: string;
  [key: string]: unknown;
}

export interface JwksClientOptions {
  /** How long a fetched key set is served without revalidating. Supabase's
   *  edge caches the endpoint for ~10 minutes, so a shorter TTL buys little. */
  cacheTtlMs?: number;
  /** Floor between two network fetches, so unknown-`kid` traffic can't
   *  amplify into outbound requests. */
  minRefetchIntervalMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Abort a hung JWKS fetch rather than stalling every login. */
  timeoutMs?: number;
}

export class JwksFetchError extends Error {}

export class JwksClient {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private lastAttemptAt = 0;
  private inFlight: Promise<void> | null = null;

  private readonly cacheTtlMs: number;
  private readonly minRefetchIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly url: string,
    options: JwksClientOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? 10 * 60 * 1000;
    this.minRefetchIntervalMs = options.minRefetchIntervalMs ?? 30 * 1000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /**
   * Resolve a `kid` to a public key, refetching when the key is unknown or
   * the cache has aged out. Returns null when the key genuinely isn't
   * published (so callers reject the token rather than 500).
   */
  async getKey(kid: string, now = Date.now()): Promise<KeyObject | null> {
    const cached = this.keys.get(kid);
    if (cached && now - this.fetchedAt < this.cacheTtlMs) return cached;

    if (now - this.lastAttemptAt >= this.minRefetchIntervalMs) {
      await this.refresh(now);
    }
    // Fall back to a stale-but-known key: a rotation we haven't picked up
    // yet must not sign every existing user out.
    return this.keys.get(kid) ?? cached ?? null;
  }

  /** Fetch and replace the cached key set. Concurrent callers share one request. */
  private async refresh(now: number): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.lastAttemptAt = now;
    this.inFlight = this.fetchKeys()
      .then((keys) => {
        this.keys = keys;
        this.fetchedAt = Date.now();
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async fetchKeys(): Promise<Map<string, KeyObject>> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: "application/json" },
      });
    } catch (err) {
      throw new JwksFetchError(
        `Could not reach the JWKS endpoint at ${this.url}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    if (!response.ok) {
      throw new JwksFetchError(`JWKS endpoint ${this.url} returned ${response.status}`);
    }

    const body: unknown = await response.json().catch(() => null);
    const rawKeys =
      typeof body === "object" && body !== null && Array.isArray((body as { keys?: unknown }).keys)
        ? ((body as { keys: unknown[] }).keys as Jwk[])
        : [];

    const keys = new Map<string, KeyObject>();
    for (const jwk of rawKeys) {
      // Signing keys only, and only algorithms we're willing to verify.
      if (!jwk || typeof jwk.kid !== "string") continue;
      if (jwk.use && jwk.use !== "sig") continue;
      if (typeof jwk.alg === "string" && !isAsymmetricAlgorithm(jwk.alg)) continue;
      if (jwk.kty === "oct") continue; // symmetric key material — never from a JWKS
      try {
        keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: "jwk" }));
      } catch {
        // A key we can't import (unsupported curve, malformed) is skipped
        // rather than failing the whole set — other keys may still verify.
      }
    }
    return keys;
  }
}
