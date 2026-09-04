import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAuthAdapter } from "../src/auth/adapter";
import { signAccessToken } from "../src/auth/jwt";
import { createApp, type Deps } from "../src/server";
import { MemoryStore } from "../src/store/memory-store";

/**
 * End-to-end session lifecycle over real HTTP: sign in, rotate, detect a
 * stolen token, sign out, delete the account.
 */

const JWT_SECRET = "test-secret-that-is-long-enough-for-prod";

let server: Server;
let baseUrl: string;
let store: MemoryStore;

async function startApp(overrides: Partial<Deps> = {}) {
  store = new MemoryStore();
  const app = createApp({
    store,
    questions: [],
    authAdapter: new FakeAuthAdapter(),
    jwtSecret: JWT_SECRET,
    // Off by default so lifecycle tests aren't throttled; there's a dedicated
    // test below that turns it on.
    authRateLimit: false,
    ...overrides,
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function post(path: string, body?: unknown, token?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Body of an error envelope, typed so assertions stay readable. */
async function errorBody(res: Response): Promise<{ error: { code: string; message: string } }> {
  return (await res.json()) as { error: { code: string; message: string } };
}

function get(path: string, token?: string) {
  return fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function signIn(displayName = "Ada") {
  const res = await post("/v1/auth/dev", { displayName, timezone: "Europe/Berlin" });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    profile: { id: string; displayName: string };
  };
}

beforeEach(() => startApp());
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("sign-in", () => {
  it("returns an access token, a refresh token, and the profile", async () => {
    const session = await signIn();
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.expiresIn).toBeGreaterThan(0);
    expect(session.profile.displayName).toBe("Ada");
  });

  it("issues an access token that authenticates a request", async () => {
    const session = await signIn();
    const me = await get("/v1/me", session.accessToken);
    expect(me.status).toBe(200);
  });

  it("rejects a request with no token", async () => {
    expect((await get("/v1/me")).status).toBe(401);
  });

  it("rejects an access token signed with another secret", async () => {
    const session = await signIn();
    const forged = signAccessToken(session.profile.id, "some-other-secret-entirely");
    expect((await get("/v1/me", forged)).status).toBe(401);
  });

  it("gives two sign-ins independent sessions", async () => {
    const first = await signIn();
    const second = await signIn();
    // Same underlying user (the fake adapter keys on the name), separate
    // rotation families — signing out one device must not kill the other.
    expect(second.profile.id).toBe(first.profile.id);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    expect((await post("/v1/auth/logout", { refreshToken: first.refreshToken })).status).toBe(204);
    expect((await post("/v1/auth/refresh", { refreshToken: second.refreshToken })).status).toBe(200);
  });
});

describe("refresh rotation", () => {
  it("swaps a refresh token for a brand new pair", async () => {
    const session = await signIn();
    const res = await post("/v1/auth/refresh", { refreshToken: session.refreshToken });
    expect(res.status).toBe(200);

    const next = (await res.json()) as { accessToken: string; refreshToken: string };
    expect(next.refreshToken).not.toBe(session.refreshToken);
    expect((await get("/v1/me", next.accessToken)).status).toBe(200);
  });

  it("burns the old token on rotation", async () => {
    const session = await signIn();
    await post("/v1/auth/refresh", { refreshToken: session.refreshToken });

    const replayed = await post("/v1/auth/refresh", { refreshToken: session.refreshToken });
    expect(replayed.status).toBe(401);
    expect((await errorBody(replayed)).error.code).toBe("SESSION_REVOKED");
  });

  it("revokes the whole family when a rotated token is replayed", async () => {
    // The attack this defends against: someone copies a refresh token, the
    // real client rotates it, then the attacker presents their stale copy.
    // We cannot tell which party is which, so both are signed out.
    const session = await signIn();
    const second = (await (
      await post("/v1/auth/refresh", { refreshToken: session.refreshToken })
    ).json()) as { refreshToken: string };

    await post("/v1/auth/refresh", { refreshToken: session.refreshToken }); // replay
    const live = await post("/v1/auth/refresh", { refreshToken: second.refreshToken });
    expect(live.status).toBe(401);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await post("/v1/auth/refresh", { refreshToken: "not-a-real-token" });
    expect(res.status).toBe(401);
    expect((await errorBody(res)).error.code).toBe("SESSION_EXPIRED");
  });

  it("rejects an expired refresh token", async () => {
    await new Promise((resolve) => server.close(resolve));
    await startApp({ refreshTokenTtlSeconds: -1 });

    const session = await signIn();
    const res = await post("/v1/auth/refresh", { refreshToken: session.refreshToken });
    expect(res.status).toBe(401);
    expect((await errorBody(res)).error.code).toBe("SESSION_EXPIRED");
  });

  it("rejects a refresh token whose account was deleted", async () => {
    const session = await signIn();
    await fetch(`${baseUrl}/v1/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const res = await post("/v1/auth/refresh", { refreshToken: session.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe("sign-out", () => {
  it("revokes the session and works without a valid access token", async () => {
    const session = await signIn();
    // Deliberately unauthenticated: an expired access token must never trap
    // a user in a session they want to end.
    expect((await post("/v1/auth/logout", { refreshToken: session.refreshToken })).status).toBe(204);
    expect((await post("/v1/auth/refresh", { refreshToken: session.refreshToken })).status).toBe(401);
  });

  it("does not reveal whether an unknown token existed", async () => {
    expect((await post("/v1/auth/logout", { refreshToken: "never-issued" })).status).toBe(204);
  });

  it("signs out every device via /v1/me/logout-all", async () => {
    const phone = await signIn();
    const laptop = await signIn();

    expect((await post("/v1/me/logout-all", undefined, phone.accessToken)).status).toBe(204);
    expect((await post("/v1/auth/refresh", { refreshToken: phone.refreshToken })).status).toBe(401);
    expect((await post("/v1/auth/refresh", { refreshToken: laptop.refreshToken })).status).toBe(401);
  });
});

describe("account deletion", () => {
  it("erases the account and every session it owned", async () => {
    const session = await signIn();
    const res = await fetch(`${baseUrl}/v1/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(res.status).toBe(204);

    expect(await store.getUser(session.profile.id)).toBeNull();
    // The access token is still cryptographically valid but resolves to nobody.
    expect((await get("/v1/me", session.accessToken)).status).toBe(401);
  });

  it("requires authentication", async () => {
    expect((await fetch(`${baseUrl}/v1/me`, { method: "DELETE" })).status).toBe(401);
  });
});

describe("dev login gate", () => {
  it("is refused when the server disables it", async () => {
    await new Promise((resolve) => server.close(resolve));
    await startApp({ devLoginEnabled: false });

    const res = await post("/v1/auth/dev", { displayName: "Ada", timezone: "Europe/Berlin" });
    expect(res.status).toBe(403);
    expect((await errorBody(res)).error.code).toBe("DEV_LOGIN_DISABLED");
  });
});

describe("auth rate limiting", () => {
  it("returns 429 with Retry-After once the window is exhausted", async () => {
    await new Promise((resolve) => server.close(resolve));
    await startApp({ authRateLimit: { windowMs: 60_000, max: 3 } });

    const attempt = () => post("/v1/auth/refresh", { refreshToken: "wrong" });
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);

    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect((await errorBody(limited)).error.code).toBe("RATE_LIMITED");
  });

  it("does not throttle authenticated game endpoints", async () => {
    await new Promise((resolve) => server.close(resolve));
    await startApp({ authRateLimit: { windowMs: 60_000, max: 1 } });

    const session = await signIn();
    for (let i = 0; i < 5; i++) {
      expect((await get("/v1/me", session.accessToken)).status).toBe(200);
    }
  });
});
