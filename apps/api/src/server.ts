import type { ContentQuestion } from "@sysdojo/shared";
import express from "express";
import type { AuthAdapter } from "./auth/adapter";
import { requireAuth } from "./auth/middleware";
import { errorMiddleware } from "./errors";
import { log } from "./log";
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
}

export function createApp(deps: Deps): express.Express {
  const app = express();
  app.use(express.json());

  // Browsers (Expo web on :8081) enforce CORS; native apps ignore it. The
  // API is token-authed with no cookies, so a wide-open default is safe;
  // self-hosters can pin it down with CORS_ORIGIN.
  const corsOrigin = deps.corsOrigin ?? "*";
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    if (corsOrigin !== "*") res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
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
