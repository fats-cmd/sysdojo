import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_TTL_SECONDS } from "../config";

/**
 * The API's own access token. Deliberately short-lived: clients hold a
 * rotating refresh token (see refresh.ts) and trade it for a new pair, so
 * a leaked access token is useful for minutes rather than the lifetime of
 * the account.
 *
 * `iss`/`aud` are pinned on both sign and verify so a token minted for a
 * different service that happens to share the secret can't be replayed here.
 */

export const ACCESS_TOKEN_ISSUER = "sysdojo";
export const ACCESS_TOKEN_AUDIENCE = "sysdojo-app";

export function signAccessToken(
  userId: string,
  secret: string,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): string {
  return jwt.sign({}, secret, {
    subject: userId,
    expiresIn: ttlSeconds,
    algorithm: "HS256",
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string, secret: string): string | null {
  try {
    // `algorithms` is pinned so a token claiming `alg: none` (or any other
    // algorithm) can never be accepted against our HMAC secret.
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    });
    if (typeof payload === "string" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
