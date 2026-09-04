import { describe, expect, it } from "vitest";
import {
  evaluateRefreshToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from "../src/auth/refresh";
import type { RefreshTokenRecord } from "../src/store/store";

const NOW = new Date("2026-09-03T12:00:00Z");

function record(overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
  return {
    id: "token-1",
    userId: "user-1",
    tokenHash: "hash",
    familyId: "family-1",
    createdAt: new Date("2026-09-01T12:00:00Z"),
    expiresAt: new Date("2026-11-01T12:00:00Z"),
    revokedAt: null,
    replacedBy: null,
    ...overrides,
  };
}

describe("refresh token generation", () => {
  it("produces unguessable, URL-safe tokens", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    // 32 bytes of base64url — no padding, no characters needing escaping.
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes deterministically, and the hash is not the token", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computes an expiry the given number of seconds out", () => {
    expect(refreshTokenExpiresAt(NOW, 60).toISOString()).toBe("2026-09-03T12:01:00.000Z");
  });
});

describe("evaluateRefreshToken", () => {
  it("accepts a live, unrotated token", () => {
    expect(evaluateRefreshToken(record(), NOW)).toEqual({ kind: "valid" });
  });

  it("treats an already-rotated token as reuse and names the family", () => {
    const decision = evaluateRefreshToken(record({ replacedBy: "token-2" }), NOW);
    expect(decision).toEqual({ kind: "reused", familyId: "family-1" });
  });

  it("rejects a revoked token", () => {
    expect(evaluateRefreshToken(record({ revokedAt: NOW }), NOW)).toEqual({ kind: "revoked" });
  });

  it("rejects an expired token", () => {
    const expired = record({ expiresAt: new Date("2026-09-03T11:59:59Z") });
    expect(evaluateRefreshToken(expired, NOW)).toEqual({ kind: "expired" });
  });

  it("treats the exact expiry instant as expired", () => {
    expect(evaluateRefreshToken(record({ expiresAt: NOW }), NOW)).toEqual({ kind: "expired" });
  });

  it("reports reuse even for a token that has since expired", () => {
    // Order matters: a stolen token that later expired must still burn the
    // family, or an attacker gets a free pass by waiting.
    const stolen = record({
      replacedBy: "token-2",
      expiresAt: new Date("2026-09-03T11:00:00Z"),
    });
    expect(evaluateRefreshToken(stolen, NOW)).toEqual({ kind: "reused", familyId: "family-1" });
  });

  it("reports reuse ahead of revocation", () => {
    const both = record({ replacedBy: "token-2", revokedAt: NOW });
    expect(evaluateRefreshToken(both, NOW)).toMatchObject({ kind: "reused" });
  });
});
