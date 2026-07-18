import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type {
  DailyAnswerRecord,
  ReviewRecord,
  Store,
  UserRecord,
} from "./store";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

/** Postgres store. Field names mirror the Store records 1:1 (see schema.prisma). */
export class PrismaStore implements Store {
  constructor(private readonly db: PrismaClient) {}

  async getUser(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  async getUserByExternalId(externalId: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { externalId } });
  }

  async createUser(user: Omit<UserRecord, "id">): Promise<UserRecord> {
    return this.db.user.create({ data: user });
  }

  async updateUser(user: UserRecord): Promise<UserRecord> {
    const { id, ...data } = user;
    return this.db.user.update({ where: { id }, data });
  }

  async getDailyAnswer(userId: string, day: string): Promise<DailyAnswerRecord | null> {
    return this.db.dailyAnswer.findUnique({
      where: { userId_day: { userId, day } },
    });
  }

  async saveDailyAnswer(answer: DailyAnswerRecord): Promise<void> {
    const { userId, day, ...rest } = answer;
    await this.db.dailyAnswer.upsert({
      where: { userId_day: { userId, day } },
      create: answer,
      update: rest,
    });
  }

  async listDueReviews(userId: string, day: string): Promise<ReviewRecord[]> {
    return this.db.review.findMany({
      where: { userId, dueDay: { lte: day } },
      orderBy: { dueDay: "asc" },
    });
  }

  async getReview(id: string): Promise<ReviewRecord | null> {
    return this.db.review.findUnique({ where: { id } });
  }

  async getReviewByQuestion(userId: string, questionId: string): Promise<ReviewRecord | null> {
    return this.db.review.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
  }

  async upsertReview(review: Omit<ReviewRecord, "id"> & { id?: string }): Promise<ReviewRecord> {
    const { id, userId, questionId, ...rest } = review;
    return this.db.review.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: { ...(id ? { id } : {}), userId, questionId, ...rest },
      update: rest,
    });
  }

  async deleteReview(id: string): Promise<void> {
    // deleteMany so deleting an already-removed item is a no-op, matching
    // MemoryStore semantics (routes prune orphans opportunistically).
    await this.db.review.deleteMany({ where: { id } });
  }
}
