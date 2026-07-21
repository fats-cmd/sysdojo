import { Router } from "express";
import {
  devLoginRequestSchema,
  loginRequestSchema,
  type AuthResponse,
} from "@sysdojo/shared";
import { asyncHandler, HttpError } from "../errors";
import { isValidTimezone } from "../game/time";
import { signAccessToken } from "../auth/jwt";
import { toProfile } from "../serialize";
import type { Deps } from "../server";
import type { Store } from "../store/store";

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

export function authRouter({ store, authAdapter, jwtSecret, devLoginEnabled }: Deps): Router {
  const router = Router();

  // Provider login: the adapter verifies the credential (e.g. a Supabase
  // access token) and vouches for a stable external identity; the API then
  // issues its own JWT. Works in dev mode too (the fake adapter ignores
  // the credential).
  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const body = loginRequestSchema.parse(req.body);
      if (!isValidTimezone(body.timezone)) {
        throw new HttpError(400, "INVALID_TIMEZONE", `Unknown IANA timezone: ${body.timezone}`);
      }

      const identity = await authAdapter.authenticate({
        credential: body.credential,
        displayName: body.displayName,
      });
      const user = await provisionUser(store, identity, body.timezone);

      const response: AuthResponse = {
        token: signAccessToken(user.id, jwtSecret),
        profile: toProfile(user),
      };
      res.json(response);
    }),
  );

  // Dev-mode login: no credentials at all. Disabled once a real auth
  // provider is configured (unless ALLOW_DEV_LOGIN=1 for local testing).
  router.post(
    "/dev",
    asyncHandler(async (req, res) => {
      if (devLoginEnabled === false) {
        throw new HttpError(403, "DEV_LOGIN_DISABLED", "Dev login is disabled on this server");
      }
      const body = devLoginRequestSchema.parse(req.body);
      if (!isValidTimezone(body.timezone)) {
        throw new HttpError(400, "INVALID_TIMEZONE", `Unknown IANA timezone: ${body.timezone}`);
      }

      const identity = await authAdapter.authenticate({ displayName: body.displayName });
      const user = await provisionUser(store, identity, body.timezone);

      const response: AuthResponse = {
        token: signAccessToken(user.id, jwtSecret),
        profile: toProfile(user),
      };
      res.json(response);
    }),
  );

  return router;
}
