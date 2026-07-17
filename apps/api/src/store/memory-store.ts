import { randomUUID } from "node:crypto";
import type {
  DailyAnswerRecord,
  ReviewRecord,
  Store,
  UserRecord,
} from "./store";

/** Dev/test store. Data lives for the lifetime of the process. */
export class MemoryStore implements Store {
  private users = new Map<string, UserRecord>();
  private dailyAnswers = new Map<string, DailyAnswerRecord>(); // `${userId}:${day}`
  private reviews = new Map<string, ReviewRecord>();

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
