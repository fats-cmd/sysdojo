import jwt from "jsonwebtoken";
import { HttpError } from "../errors";
import { log } from "../log";
import type { AuthAdapter } from "./adapter";
import { ASYMMETRIC_ALGORITHMS, isAsymmetricAlgorithm, JwksClient, JwksFetchError } from "./jwks";

/**
 * Verifies Supabase access tokens server-side, with no supabase-js dependency.
 *
 * Two signing schemes are supported:
 * - **Asymmetric (preferred).** Supabase signs session JWTs with an ES256/RS256
 *   key whose public half is published at the project's JWKS endpoint. Keys
 *   can be rotated and revoked without redeploying us, and no shared secret
 *   exists to leak.
 * - **Legacy HS256.** The project's shared JWT secret. Still accepted for
 *   projects that have not migrated, but it is a symmetric secret: anything
 *   that can verify a token can also mint one.
 *
 * The algorithm in the token header selects the path, and each path is
 * restricted to its own key material — a token cannot present `alg: HS256`
 * and get verified against a public key (the classic algorithm-confusion
 * attack), because the HS256 branch only ever uses the legacy secret.
 *
 * The client obtains the token via Supabase auth (OAuth, OTP, …) and posts
 * it to /v1/auth/login as `credential`.
 */

export interface SupabaseAuthAdapterOptions {
  /** JWKS discovery URL for asymmetric signing keys. */
  jwksUrl?: string | null;
  /** Legacy shared HS256 secret. */
  legacySecret?: string | null;
  /** Expected `iss` claim, e.g. `https://ref.supabase.co/auth/v1`. */
  issuer?: string | null;
  /** Pre-built client, for tests. */
  jwksClient?: JwksClient;
}

const invalid = (message: string) => new HttpError(401, "INVALID_CREDENTIAL", message);

export class SupabaseAuthAdapter implements AuthAdapter {
  private readonly jwks: JwksClient | null;
  private readonly legacySecret: string | null;
  private readonly issuer: string | null;

  constructor(options: SupabaseAuthAdapterOptions) {
    this.jwks =
      options.jwksClient ?? (options.jwksUrl ? new JwksClient(options.jwksUrl) : null);
    this.legacySecret = options.legacySecret ?? null;
    this.issuer = options.issuer ?? null;

    if (!this.jwks && !this.legacySecret) {
      throw new Error(
        "SupabaseAuthAdapter needs a JWKS URL or a legacy JWT secret to verify tokens",
      );
    }
  }

  async authenticate(input: { credential?: string; displayName?: string }) {
    if (!input.credential) {
      throw invalid("Missing Supabase access token");
    }

    const header = decodeHeader(input.credential);
    if (!header) throw invalid("Supabase token is malformed");

    const payload = isAsymmetricAlgorithm(header.alg)
      ? await this.verifyAsymmetric(input.credential, header.kid)
      : this.verifyLegacy(input.credential, header.alg);

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw invalid("Supabase token has no subject");
    }

    const metadata = (payload.user_metadata ?? {}) as Record<string, unknown>;
    const metadataName =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null;
    const email = typeof payload.email === "string" ? payload.email : null;

    return {
      externalId: `supabase:${payload.sub}`,
      // Explicit displayName (e.g. from a signup form) wins, then profile
      // metadata, then the email prefix.
      displayName:
        input.displayName?.trim() || metadataName || email?.split("@")[0] || "Learner",
    };
  }

  private async verifyAsymmetric(token: string, kid: string | undefined): Promise<jwt.JwtPayload> {
    if (!this.jwks) {
      log.error("received an asymmetrically-signed Supabase token but SUPABASE_URL is not set");
      throw invalid("Supabase token is invalid or expired");
    }
    if (!kid) throw invalid("Supabase token header has no key id");

    let key;
    try {
      key = await this.jwks.getKey(kid);
    } catch (err) {
      if (err instanceof JwksFetchError) {
        // The provider is down, not the credential's fault. A 401 here would
        // sign every user out of a healthy app.
        log.error("JWKS fetch failed:", err.message);
        throw new HttpError(
          503,
          "AUTH_PROVIDER_UNAVAILABLE",
          "Could not reach the auth provider to verify the token. Try again shortly.",
        );
      }
      throw err;
    }
    if (!key) throw invalid("Supabase token was signed with an unknown key");

    return this.verifyWith(token, key, ASYMMETRIC_ALGORITHMS as unknown as jwt.Algorithm[]);
  }

  private verifyLegacy(token: string, alg: string): jwt.JwtPayload {
    if (alg !== "HS256") throw invalid(`Unsupported token algorithm: ${alg}`);
    if (!this.legacySecret) {
      throw invalid("Supabase token uses the legacy shared secret, which is not configured");
    }
    return this.verifyWith(token, this.legacySecret, ["HS256"]);
  }

  private verifyWith(
    token: string,
    key: jwt.Secret,
    algorithms: jwt.Algorithm[],
  ): jwt.JwtPayload {
    try {
      const verified = jwt.verify(token, key, {
        algorithms,
        // Supabase sets aud to "authenticated" for signed-in users.
        audience: "authenticated",
        // Pins tokens to *our* project when SUPABASE_URL is configured.
        ...(this.issuer ? { issuer: this.issuer } : {}),
      });
      if (typeof verified === "string") throw new Error("unexpected string payload");
      return verified;
    } catch {
      throw invalid("Supabase token is invalid or expired");
    }
  }
}

function decodeHeader(token: string): { alg: string; kid?: string } | null {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded.header.alg !== "string") return null;
    return { alg: decoded.header.alg, kid: decoded.header.kid };
  } catch {
    return null;
  }
}
