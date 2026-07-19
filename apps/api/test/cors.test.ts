import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeAuthAdapter } from "../src/auth/adapter";
import { createApp } from "../src/server";
import { MemoryStore } from "../src/store/memory-store";

/** Expo web runs in a browser, which enforces CORS; the API must answer
 *  preflights and stamp Access-Control-Allow-* headers on responses. */
describe("CORS", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp({
      store: new MemoryStore(),
      questions: [],
      authAdapter: new FakeAuthAdapter(),
      jwtSecret: "test-secret",
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("answers preflight OPTIONS with allow headers", async () => {
    const res = await fetch(`${baseUrl}/v1/auth/dev`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8081",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, authorization",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toMatch(/authorization/i);
  });

  it("stamps allow-origin on actual responses", async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "http://localhost:8081" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
