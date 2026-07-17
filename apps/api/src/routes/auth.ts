import { Router } from "express";
import { devLoginRequestSchema, type AuthResponse } from "@sysdojo/shared";
import { asyncHandler, HttpError } from "../errors";
import { isValidTimezone } from "../game/time";
import { signAccessToken } from "../auth/jwt";
import { toProfile } from "../serialize";
import type { Deps } from "../server";

export function authRouter({ store, authAdapter, jwtSecret }: Deps): Router {
  const router = Router();

  // Dev-mode login: no real credentials, identity comes from the fake adapter.
  router.post(
    "/dev",
    asyncHandler(async (req, res) => {
      const body = devLoginRequestSchema.parse(req.body);
      if (!isValidTimezone(body.timezone)) {
        throw new HttpError(400, "INVALID_TIMEZONE", `Unknown IANA timezone: ${body.timezone}`);
      }

      const identity = await authAdapter.authenticate({ displayName: body.displayName });
      let user = await store.getUserByExternalId(identity.externalId);
      if (!user) {
        user = await store.createUser({
          externalId: identity.externalId,
          displayName: identity.displayName,
          timezone: body.timezone,
          totalXp: 0,
          combo: 0,
          streakCurrent: 0,
          streakBest: 0,
          lastActiveDay: null,
        });
      } else if (user.timezone !== body.timezone) {
        user = await store.updateUser({ ...user, timezone: body.timezone });
      }

      const response: AuthResponse = {
        token: signAccessToken(user.id, jwtSecret),
        profile: toProfile(user),
      };
      res.json(response);
    }),
  );

  return router;
}
