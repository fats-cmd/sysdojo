import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { SupabaseAuthAdapter } from "../src/auth/supabase-adapter";
import { HttpError } from "../src/errors";

const SECRET = "supabase-test-secret";
const adapter = new SupabaseAuthAdapter(SECRET);

function supabaseToken(payload: object, secret = SECRET, expiresIn = "1h"): string {
  return jwt.sign({ aud: "authenticated", ...payload }, secret, {
    subject: "user-uuid-123",
    expiresIn,
  } as jwt.SignOptions);
}

describe("SupabaseAuthAdapter", () => {
  it("accepts a valid token and derives identity from metadata name", async () => {
    const token = supabaseToken({ user_metadata: { full_name: "Ada Lovelace" } });
    const identity = await adapter.authenticate({ credential: token });
    expect(identity.externalId).toBe("supabase:user-uuid-123");
    expect(identity.displayName).toBe("Ada Lovelace");
  });

  it("falls back to the email prefix, then a default", async () => {
    const byEmail = await adapter.authenticate({
      credential: supabaseToken({ email: "grace@navy.mil" }),
    });
    expect(byEmail.displayName).toBe("grace");

    const bare = await adapter.authenticate({ credential: supabaseToken({}) });
    expect(bare.displayName).toBe("Learner");
  });

  it("prefers an explicitly provided displayName", async () => {
    const identity = await adapter.authenticate({
      credential: supabaseToken({ user_metadata: { full_name: "Ignored" } }),
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
    const forged = supabaseToken({}, "attacker-secret");
    await expect(adapter.authenticate({ credential: forged })).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIAL",
    });
  });

  it("rejects expired tokens", async () => {
    const expired = supabaseToken({}, SECRET, "-1h");
    await expect(adapter.authenticate({ credential: expired })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects tokens without the authenticated audience", async () => {
    const anon = jwt.sign({ aud: "anon" }, SECRET, { subject: "user-uuid-123" });
    await expect(adapter.authenticate({ credential: anon })).rejects.toMatchObject({
      status: 401,
    });
  });
});
