import jwt from "jsonwebtoken";

export function signAccessToken(userId: string, secret: string): string {
  return jwt.sign({}, secret, { subject: userId, expiresIn: "30d" });
}

export function verifyAccessToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === "string" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
