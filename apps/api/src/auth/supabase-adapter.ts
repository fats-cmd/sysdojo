import jwt from "jsonwebtoken";
import { HttpError } from "../errors";
import type { AuthAdapter } from "./adapter";

/**
 * Verifies Supabase access tokens server-side. Supabase signs user JWTs
 * with the project's JWT secret (HS256, Dashboard → Settings → API), so
 * verification needs no network call and no supabase-js dependency.
 * The client obtains the token via Supabase auth (OTP, OAuth, …) and
 * posts it to /v1/auth/login as `credential`.
 */
export class SupabaseAuthAdapter implements AuthAdapter {
  constructor(private readonly jwtSecret: string) {}

  async authenticate(input: { credential?: string; displayName?: string }) {
    if (!input.credential) {
      throw new HttpError(401, "INVALID_CREDENTIAL", "Missing Supabase access token");
    }

    let payload: jwt.JwtPayload;
    try {
      const verified = jwt.verify(input.credential, this.jwtSecret, {
        // Supabase sets aud to "authenticated" for signed-in users.
        audience: "authenticated",
      });
      if (typeof verified === "string") throw new Error("unexpected string payload");
      payload = verified;
    } catch {
      throw new HttpError(401, "INVALID_CREDENTIAL", "Supabase token is invalid or expired");
    }

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new HttpError(401, "INVALID_CREDENTIAL", "Supabase token has no subject");
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
}
