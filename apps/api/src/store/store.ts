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

  getDailyAnswer(userId: string, day: string): Promise<DailyAnswerRecord | null>;
  saveDailyAnswer(answer: DailyAnswerRecord): Promise<void>;

  listDueReviews(userId: string, day: string): Promise<ReviewRecord[]>;
  getReview(id: string): Promise<ReviewRecord | null>;
  getReviewByQuestion(userId: string, questionId: string): Promise<ReviewRecord | null>;
  upsertReview(review: Omit<ReviewRecord, "id"> & { id?: string }): Promise<ReviewRecord>;
  deleteReview(id: string): Promise<void>;
}
