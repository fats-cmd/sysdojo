import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../errors";
import type { Store, UserRecord } from "../store/store";
import { verifyAccessToken } from "./jwt";

export interface AuthedRequest extends Request {
  user: UserRecord;
}

export function requireAuth(store: Store, jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) return next(unauthorized());

    const userId = verifyAccessToken(token, jwtSecret);
    if (!userId) return next(unauthorized());

    store
      .getUser(userId)
      .then((user) => {
        if (!user) return next(unauthorized("User no longer exists"));
        (req as AuthedRequest).user = user;
        next();
      })
      .catch(next);
  };
}
