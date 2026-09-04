import type { NextFunction, Request, Response } from "express";

/**
 * Fixed-window rate limiter for the auth endpoints.
 *
 * Unauthenticated endpoints are the ones worth protecting: /v1/auth/login
 * verifies a signature (CPU) and /v1/auth/refresh does a database lookup per
 * call, so both are cheap to spam and expensive to serve.
 *
 * Deliberately in-process and dependency-free. That means the limit is *per
 * API instance* — behind N replicas the effective ceiling is N × max. For a
 * self-hosted single-instance deployment that is exactly right; if you scale
 * out and need a global limit, put it in a shared store or at the edge.
 *
 * `req.ip` is only trustworthy when Express is told about your proxy: set
 * TRUST_PROXY to the number of proxies in front of the API, or every request
 * will look like it comes from the load balancer.
 */

export interface RateLimitOptions {
  windowMs: number;
  /** Requests allowed per key per window. */
  max: number;
  /** Defaults to the client IP. */
  keyFor?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimit({ windowMs, max, keyFor }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  // Sweep on a timer rather than per request so a burst of unique keys can't
  // grow the map without bound. unref() keeps this from holding the process
  // (and the test runner) open.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyFor ? keyFor(req) : (req.ip ?? "unknown");
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count++;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Try again in ${retryAfter}s.`,
        },
      });
      return;
    }
    next();
  };
}
