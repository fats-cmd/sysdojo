import { Router } from "express";
import { updateProfileRequestSchema } from "@sysdojo/shared";
import { asyncHandler, HttpError } from "../errors";
import type { AuthedRequest } from "../auth/middleware";
import { isValidTimezone } from "../game/time";
import { toProfile } from "../serialize";
import type { Deps } from "../server";

export function meRouter({ store }: Deps): Router {
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

  return router;
}
