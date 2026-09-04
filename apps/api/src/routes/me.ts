import { Router } from "express";
import { updateProfileRequestSchema } from "@sysdojo/shared";
import { asyncHandler, HttpError } from "../errors";
import type { AuthedRequest } from "../auth/middleware";
import { isValidTimezone } from "../game/time";
import { log } from "../log";
import { toProfile } from "../serialize";
import type { ResolvedDeps } from "../server";

export function meRouter({ store }: ResolvedDeps): Router {
  const router = Router();

  router.get(
    "/me",
    asyncHandler<AuthedRequest>(async (req, res) => {
      res.json(toProfile(req.user));
    }),
  );

  router.patch(
    "/me",
    asyncHandler<AuthedRequest>(async (req, res) => {
      const body = updateProfileRequestSchema.parse(req.body);
      if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
        throw new HttpError(400, "INVALID_TIMEZONE", `Unknown IANA timezone: ${body.timezone}`);
      }
      const updated = await store.updateUser({
        ...req.user,
        displayName: body.displayName ?? req.user.displayName,
        timezone: body.timezone ?? req.user.timezone,
      });
      res.json(toProfile(updated));
    }),
  );

  // Sign out everywhere: revokes every refresh-token family for the user, so
  // a device that was lost or a session that was shared stops working on the
  // next refresh (within the access token's short TTL).
  router.post(
    "/me/logout-all",
    asyncHandler<AuthedRequest>(async (req, res) => {
      await store.revokeUserRefreshTokens(req.user.id, new Date());
      res.status(204).end();
    }),
  );

  /**
   * Delete the account and all its data. App Store guideline 5.1.1(v)
   * requires any app that lets users create an account to let them delete it
   * from inside the app, so this is a shipping requirement, not a nicety.
   *
   * Note this removes the *sysdojo* account only. The identity at the auth
   * provider is untouched: signing in again creates a fresh, empty account.
   */
  router.delete(
    "/me",
    asyncHandler<AuthedRequest>(async (req, res) => {
      await store.deleteUser(req.user.id);
      log.info(`deleted account ${req.user.id}`);
      res.status(204).end();
    }),
  );

  return router;
}
