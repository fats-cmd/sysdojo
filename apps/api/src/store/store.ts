/**
 * Persistence boundary. Routes only ever talk to this interface, so swapping
 * the in-memory dev store for the Prisma/Postgres implementation (next phase)
 * touches nothing else.
 */

export interface UserRecord {
  id: string;
  externalId: string;
  displayName: string;
  timezone: string;
  totalXp: number;
  combo: number;
  streakCurrent: number;
  streakBest: number;
  lastActiveDay: string | null;
}

export interface DailyAnswerRecord {
  userId: string;
  day: string;
  questionId: string;
  choiceIndex: number;
  correct: boolean;
  xpAwarded: number;
  combo: number;
}

/**
 * A rotating refresh token. `tokenHash` is the SHA-256 of the opaque token
 * handed to the client — the plaintext is never stored. `familyId` groups
 * every token descended from one sign-in, so detecting reuse can revoke the
 * whole chain at once.
 */
export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  createdAt: Date;
  expiresAt: Date;
  /** Set when the token was revoked (sign-out, or a compromised family). */
  revokedAt: Date | null;
  /** Id of the token that superseded this one. Non-null ⇒ already rotated. */
  replacedBy: string | null;
}

export interface ReviewRecord {
  id: string;
  userId: string;
  questionId: string;
  intervalIndex: number;
  lapses: number;
  dueDay: string;
}

export interface Store {
  getUser(id: string): Promise<UserRecord | null>;
  getUserByExternalId(externalId: string): Promise<UserRecord | null>;
  createUser(user: Omit<UserRecord, "id">): Promise<UserRecord>;
  updateUser(user: UserRecord): Promise<UserRecord>;
  /** Erase the account and everything hanging off it (answers, reviews,
   *  refresh tokens). Required for in-app account deletion. */
  deleteUser(id: string): Promise<void>;

  createRefreshToken(token: Omit<RefreshTokenRecord, "id"> & { id?: string }): Promise<RefreshTokenRecord>;
  getRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Mark `id` as rotated into `replacedBy`. */
  replaceRefreshToken(id: string, replacedBy: string): Promise<void>;
  /** Revoke every live token in a rotation family (reuse detected, sign-out). */
  revokeRefreshTokenFamily(familyId: string, revokedAt: Date): Promise<void>;
  /** Revoke every live token for a user (sign out of all devices). */
  revokeUserRefreshTokens(userId: string, revokedAt: Date): Promise<void>;
  /** Housekeeping: drop rows that can no longer authenticate anyone. */
  deleteExpiredRefreshTokens(now: Date): Promise<number>;

  getDailyAnswer(userId: string, day: string): Promise<DailyAnswerRecord | null>;
  saveDailyAnswer(answer: DailyAnswerRecord): Promise<void>;

  listDueReviews(userId: string, day: string): Promise<ReviewRecord[]>;
  getReview(id: string): Promise<ReviewRecord | null>;
  getReviewByQuestion(userId: string, questionId: string): Promise<ReviewRecord | null>;
  upsertReview(review: Omit<ReviewRecord, "id"> & { id?: string }): Promise<ReviewRecord>;
  deleteReview(id: string): Promise<void>;
}
