import express from "express";
import type { ContentQuestion } from "@sysdojo/shared";
import type { AuthAdapter } from "./auth/adapter";
import { requireAuth } from "./auth/middleware";
import { errorMiddleware } from "./errors";
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
}

export function createApp(deps: Deps): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, questions: deps.questions.length });
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
