import { Router } from "express";
import {
  devLoginRequestSchema,
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  type AuthResponse,
} from "@sysdojo/shared";
import { asyncHandler, HttpError } from "../errors";
import { isValidTimezone } from "../game/time";
import { signAccessToken } from "../auth/jwt";
import {
  evaluateRefreshToken,
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
  refreshTokenExpiresAt,
} from "../auth/refresh";
import { log } from "../log";
import { toProfile } from "../serialize";
import type { ResolvedDeps } from "../server";
import type { Store, UserRecord } from "../store/store";

/** Find-or-create the user for a verified identity and stamp the timezone. */
async function provisionUser(
  store: Store,
  identity: { externalId: string; displayName: string },
  timezone: string,
) {
  let user = await store.getUserByExternalId(identity.externalId);
  if (!user) {
    user = await store.createUser({
      externalId: identity.externalId,
      displayName: identity.displayName,
      timezone,
      totalXp: 0,
      combo: 0,
      streakCurrent: 0,
      streakBest: 0,
      lastActiveDay: null,
    });
  } else if (user.timezone !== timezone) {
    user = await store.updateUser({ ...user, timezone });
  }
  return user;
}

/**
 * Mint an access/refresh pair. `familyId` chains a rotation lineage: a fresh
 * sign-in starts a new family, a refresh continues the existing one.
 */
async function issueSession(
  deps: Pick<ResolvedDeps, "store" | "jwtSecret" | "accessTokenTtlSeconds" | "refreshTokenTtlSeconds">,
  user: UserRecord,
  familyId: string,
  now: Date,
): Promise<{ response: AuthResponse; refreshTokenId: string }> {
  const refreshToken = generateRefreshToken();
  const record = await deps.store.createRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    familyId,
    createdAt: now,
    expiresAt: refreshTokenExpiresAt(now, deps.refreshTokenTtlSeconds),
    revokedAt: null,
    replacedBy: null,
  });

  return {
    response: {
      accessToken: signAccessToken(user.id, deps.jwtSecret, deps.accessTokenTtlSeconds),
      refreshToken,
      expiresIn: deps.accessTokenTtlSeconds,
      profile: toProfile(user),
    },
    refreshTokenId: record.id,
  };
}

function assertTimezone(timezone: string): void {
  if (!isValidTimezone(timezone)) {
    throw new HttpError(400, "INVALID_TIMEZONE", `Unknown IANA timezone: ${timezone}`);
  }
}

/** A refresh token that cannot mint a session. Always the same shape, so a
 *  caller can't distinguish "never existed" from "revoked" by probing. */
const sessionExpired = () =>
  new HttpError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.");

export function authRouter(deps: ResolvedDeps): Router {
  const { store, authAdapter, devLoginEnabled } = deps;
  const router = Router();

  // Provider login: the adapter verifies the credential (e.g. a Supabase
  // access token) and vouches for a stable external identity; the API then
  // issues its own session. Works in dev mode too (the fake adapter ignores
  // the credential).
  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const body = loginRequestSchema.parse(req.body);
      assertTimezone(body.timezone);

      const identity = await authAdapter.authenticate({
        credential: body.credential,
        displayName: body.displayName,
      });
      const user = await provisionUser(store, identity, body.timezone);
      const { response } = await issueSession(deps, user, newFamilyId(), new Date());
      res.json(response);
    }),
  );

  /**
   * Trade a refresh token for a new pair. The presented token is invalidated
   * whatever happens, so a token is single-use.
   *
   * Two clients refreshing the same token concurrently means one of them
   * trips reuse detection and the family dies. That is the intended
   * trade-off — the alternative is tolerating replay — and clients avoid it
   * by single-flighting their refreshes (see the mobile ApiClient).
   */
  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      const body = refreshRequestSchema.parse(req.body);
      const now = new Date();

      const record = await store.getRefreshTokenByHash(hashRefreshToken(body.refreshToken));
      if (!record) throw sessionExpired();

      const decision = evaluateRefreshToken(record, now);
      if (decision.kind === "reused") {
        // The same token arrived twice: either it was stolen, or a client
        // kept a copy. Either way we can no longer tell the real user from
        // the attacker, so the whole lineage is revoked.
        log.warn(
          `refresh token reuse detected for user ${record.userId} — revoking family ${decision.familyId}`,
        );
        await store.revokeRefreshTokenFamily(decision.familyId, now);
        throw new HttpError(
          401,
          "SESSION_REVOKED",
          "This session was revoked for security reasons. Please sign in again.",
        );
      }
      if (decision.kind !== "valid") throw sessionExpired();

      // The account may have been deleted since the token was issued.
      const user = await store.getUser(record.userId);
      if (!user) throw sessionExpired();

      const { response, refreshTokenId } = await issueSession(deps, user, record.familyId, now);
      await store.replaceRefreshToken(record.id, refreshTokenId);
      res.json(response);
    }),
  );

  // Sign out this device. Unauthenticated on purpose: an expired access
  // token must not stop a user from revoking their refresh token.
  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      const body = logoutRequestSchema.parse(req.body);
      const record = await store.getRefreshTokenByHash(hashRefreshToken(body.refreshToken));
      // 204 either way — never confirm whether a token existed.
      if (record) await store.revokeRefreshTokenFamily(record.familyId, new Date());
      res.status(204).end();
    }),
  );

  // Dev-mode login: no credentials at all. Disabled whenever a real auth
  // provider is configured, and impossible in production (see config.ts).
  router.post(
    "/dev",
    asyncHandler(async (req, res) => {
      if (!devLoginEnabled) {
        throw new HttpError(403, "DEV_LOGIN_DISABLED", "Dev login is disabled on this server");
      }
      const body = devLoginRequestSchema.parse(req.body);
      assertTimezone(body.timezone);

      const identity = await authAdapter.authenticate({ displayName: body.displayName });
      const user = await provisionUser(store, identity, body.timezone);
      const { response } = await issueSession(deps, user, newFamilyId(), new Date());
      res.json(response);
    }),
  );

  return router;
}
