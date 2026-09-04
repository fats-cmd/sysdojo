import { randomUUID } from "node:crypto";
import type {
  DailyAnswerRecord,
  RefreshTokenRecord,
  ReviewRecord,
  Store,
  UserRecord,
} from "./store";

/** Dev/test store. Data lives for the lifetime of the process. */
export class MemoryStore implements Store {
  private users = new Map<string, UserRecord>();
  private dailyAnswers = new Map<string, DailyAnswerRecord>(); // `${userId}:${day}`
  private reviews = new Map<string, ReviewRecord>();
  private refreshTokens = new Map<string, RefreshTokenRecord>();

  async getUser(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async getUserByExternalId(externalId: string): Promise<UserRecord | null> {
    for (const u of this.users.values()) {
      if (u.externalId === externalId) return u;
    }
    return null;
  }

  async createUser(user: Omit<UserRecord, "id">): Promise<UserRecord> {
    const record: UserRecord = { ...user, id: randomUUID() };
    this.users.set(record.id, record);
    return record;
  }

  async updateUser(user: UserRecord): Promise<UserRecord> {
    this.users.set(user.id, user);
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
    // Postgres cascades these; the memory store has to do it by hand or a
    // recycled user id would inherit the previous account's data.
    for (const [key, answer] of this.dailyAnswers) {
      if (answer.userId === id) this.dailyAnswers.delete(key);
    }
    for (const [key, review] of this.reviews) {
      if (review.userId === id) this.reviews.delete(key);
    }
    for (const [key, token] of this.refreshTokens) {
      if (token.userId === id) this.refreshTokens.delete(key);
    }
  }

  async createRefreshToken(
    token: Omit<RefreshTokenRecord, "id"> & { id?: string },
  ): Promise<RefreshTokenRecord> {
    const record: RefreshTokenRecord = { ...token, id: token.id ?? randomUUID() };
    this.refreshTokens.set(record.id, record);
    return record;
  }

  async getRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const t of this.refreshTokens.values()) {
      if (t.tokenHash === tokenHash) return t;
    }
    return null;
  }

  async replaceRefreshToken(id: string, replacedBy: string): Promise<void> {
    const existing = this.refreshTokens.get(id);
    if (existing) this.refreshTokens.set(id, { ...existing, replacedBy });
  }

  async revokeRefreshTokenFamily(familyId: string, revokedAt: Date): Promise<void> {
    for (const [key, t] of this.refreshTokens) {
      if (t.familyId === familyId && t.revokedAt === null) {
        this.refreshTokens.set(key, { ...t, revokedAt });
      }
    }
  }

  async revokeUserRefreshTokens(userId: string, revokedAt: Date): Promise<void> {
    for (const [key, t] of this.refreshTokens) {
      if (t.userId === userId && t.revokedAt === null) {
        this.refreshTokens.set(key, { ...t, revokedAt });
      }
    }
  }

  async deleteExpiredRefreshTokens(now: Date): Promise<number> {
    let removed = 0;
    for (const [key, t] of this.refreshTokens) {
      if (t.expiresAt.getTime() <= now.getTime()) {
        this.refreshTokens.delete(key);
        removed++;
      }
    }
    return removed;
  }

  async getDailyAnswer(userId: string, day: string): Promise<DailyAnswerRecord | null> {
    return this.dailyAnswers.get(`${userId}:${day}`) ?? null;
  }

  async saveDailyAnswer(answer: DailyAnswerRecord): Promise<void> {
    this.dailyAnswers.set(`${answer.userId}:${answer.day}`, answer);
  }

  async listDueReviews(userId: string, day: string): Promise<ReviewRecord[]> {
    return [...this.reviews.values()]
      .filter((r) => r.userId === userId && r.dueDay <= day)
      .sort((a, b) => a.dueDay.localeCompare(b.dueDay));
  }

  async getReview(id: string): Promise<ReviewRecord | null> {
    return this.reviews.get(id) ?? null;
  }

  async getReviewByQuestion(userId: string, questionId: string): Promise<ReviewRecord | null> {
    for (const r of this.reviews.values()) {
      if (r.userId === userId && r.questionId === questionId) return r;
    }
    return null;
  }

  async upsertReview(review: Omit<ReviewRecord, "id"> & { id?: string }): Promise<ReviewRecord> {
    const record: ReviewRecord = { ...review, id: review.id ?? randomUUID() };
    this.reviews.set(record.id, record);
    return record;
  }

  async deleteReview(id: string): Promise<void> {
    this.reviews.delete(id);
  }
}
