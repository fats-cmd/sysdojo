import { createHash, randomBytes, randomUUID } from "node:crypto";
import { REFRESH_TOKEN_TTL_SECONDS } from "../config";
import type { RefreshTokenRecord } from "../store/store";

/**
 * Rotating refresh tokens, following the OAuth 2.0 security BCP.
 *
 * - The token itself is opaque random bytes, never a JWT: it carries no
 *   claims, so revoking it is a database write rather than a guessing game.
 * - Only the SHA-256 *hash* is stored. A dump of the database therefore
 *   cannot be replayed as sessions. (No salt or slow KDF: unlike a password,
 *   the token is 256 bits of uniform randomness, so there is nothing to
 *   brute-force and a fast hash keeps lookups a single indexed query.)
 * - Every use rotates the token and marks the old row as replaced. Seeing a
 *   replaced token again means two clients hold the same secret — the token
 *   was stolen — so the whole *family* is revoked and the real user is
 *   signed out rather than silently sharing their account.
 *
 * The decision logic is a pure function so all four outcomes are unit-tested
 * without a database.
 */

/** Bytes of entropy per refresh token. */
const TOKEN_BYTES = 32;

/** A fresh opaque token, URL-safe so it survives any transport. */
export function generateRefreshToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Stable lookup key for a token. The plaintext never reaches the database. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new rotation family, created on each fresh sign-in. */
export function newFamilyId(): string {
  return randomUUID();
}

export function refreshTokenExpiresAt(
  now: Date,
  ttlSeconds: number = REFRESH_TOKEN_TTL_SECONDS,
): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}

export type RefreshDecision =
  /** Token is live and may be rotated. */
  | { kind: "valid" }
  /** Past its expiry — the user signs in again. */
  | { kind: "expired" }
  /** Explicitly revoked (sign-out, or a compromised family). */
  | { kind: "revoked" }
  /** Already rotated once. Treated as theft: revoke the family. */
  | { kind: "reused"; familyId: string };

/**
 * Classify a presented refresh token. Order matters: reuse is checked before
 * expiry so a stolen-then-expired token still trips the family revocation.
 */
export function evaluateRefreshToken(record: RefreshTokenRecord, now: Date): RefreshDecision {
  if (record.replacedBy !== null) return { kind: "reused", familyId: record.familyId };
  if (record.revokedAt !== null) return { kind: "revoked" };
  if (record.expiresAt.getTime() <= now.getTime()) return { kind: "expired" };
  return { kind: "valid" };
}
