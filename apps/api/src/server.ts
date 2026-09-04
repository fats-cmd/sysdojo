import type { ContentQuestion } from "@sysdojo/shared";
import express from "express";
import type { AuthAdapter } from "./auth/adapter";
import { requireAuth } from "./auth/middleware";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "./config";
import { errorMiddleware } from "./errors";
import { log } from "./log";
import { rateLimit, type RateLimitOptions } from "./rate-limit";
import { authRouter } from "./routes/auth";
import { dailyRouter } from "./routes/daily";
import { meRouter } from "./routes/me";
import { reviewRouter } from "./routes/review";
import type { Store } from "./store/store";

export interface Deps {
  store: Store;
  questions: ContentQuestion[];
  authAdapter: AuthAdapter;
  jwtSecret: string;
  /** Shown on /health so it's obvious which persistence mode is live. */
  storeKind?: "postgres" | "memory";
  /** Log every request (method, path, status, duration). Off in tests. */
  logRequests?: boolean;
  /** Allowed browser origin for CORS (Expo web). Defaults to "*". */
  corsOrigin?: string;
  /** POST /v1/auth/dev — credential-free login. Defaults on outside production;
   *  config.ts makes it impossible to enable in production. */
  devLoginEnabled?: boolean;
  /** Access-token lifetime. Short by design; refresh tokens carry the session. */
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
  /** Per-IP limit on /v1/auth/*. `false` disables it (tests). */
  authRateLimit?: RateLimitOptions | false;
  /** Express `trust proxy`. Must match your deployment or rate limiting sees
   *  the proxy's IP for every request. */
  trustProxy?: boolean | number;
}

/** Deps with every default filled in. Routers receive this, never raw Deps. */
export interface ResolvedDeps extends Deps {
  devLoginEnabled: boolean;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

/** 20 attempts/minute/IP: invisible to a real client (which refreshes every
 *  ~15 minutes) but takes the sting out of credential-stuffing a login. */
const DEFAULT_AUTH_RATE_LIMIT: RateLimitOptions = { windowMs: 60_000, max: 20 };

export function createApp(rawDeps: Deps): express.Express {
  const deps: ResolvedDeps = {
    ...rawDeps,
    devLoginEnabled: rawDeps.devLoginEnabled ?? true,
    accessTokenTtlSeconds: rawDeps.accessTokenTtlSeconds ?? ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: rawDeps.refreshTokenTtlSeconds ?? REFRESH_TOKEN_TTL_SECONDS,
  };

  const app = express();
  // Governs req.ip, which is the rate-limit key. Left off by default: trusting
  // X-Forwarded-For without a proxy in front lets any client spoof its IP and
  // walk straight past the limiter.
  app.set("trust proxy", deps.trustProxy ?? false);
  // Auth payloads are a token and a timezone; a megabyte of JSON is an attack,
  // not a request.
  app.use(express.json({ limit: "64kb" }));

  // Browsers (Expo web on :8081) enforce CORS; native apps ignore it. The
  // API is token-authed with no cookies, so a wide-open default is safe;
  // self-hosters can pin it down with CORS_ORIGIN.
  const corsOrigin = deps.corsOrigin ?? "*";
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    // Caches must not serve one origin's response to another.
    if (corsOrigin !== "*") res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      // Let browsers cache the preflight so mutating calls don't pay a
      // second round-trip every time.
      res.setHeader("Access-Control-Max-Age", "600");
      res.sendStatus(204);
      return;
    }
    next();
  });

  if (deps.logRequests) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        log.info(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
      });
      next();
    });
  }

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      questions: deps.questions.length,
      store: deps.storeKind ?? "unknown",
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  const authLimit = deps.authRateLimit ?? DEFAULT_AUTH_RATE_LIMIT;
  if (authLimit !== false) app.use("/v1/auth", rateLimit(authLimit));
  app.use("/v1/auth", authRouter(deps));

  const authed = requireAuth(deps.store, deps.jwtSecret);
  app.use("/v1", authed, dailyRouter(deps));
  app.use("/v1", authed, reviewRouter(deps));
  app.use("/v1", authed, meRouter(deps));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  app.use(errorMiddleware);

  return app;
}
