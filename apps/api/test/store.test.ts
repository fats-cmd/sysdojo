import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store/memory-store";
import { createPrismaClient, PrismaStore } from "../src/store/prisma-store";
import type { Store } from "../src/store/store";

/**
 * Contract tests: every Store implementation must behave identically.
 * The Prisma suite runs only when TEST_DATABASE_URL points at a migrated
 * Postgres database (e.g. from docker compose); it is skipped otherwise
 * so `npm test` stays green without infrastructure.
 */

interface Harness {
  store: Store;
  /** Ensure question rows exist (Postgres enforces FKs; memory does not). */
  seedQuestions(ids: string[]): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

const baseUser = {
  externalId: "ext-1",
  displayName: "Dev",
  timezone: "Europe/Berlin",
  totalXp: 0,
  combo: 0,
  streakCurrent: 0,
  streakBest: 0,
  lastActiveDay: null,
};

function storeContract(makeHarness: () => Promise<Harness>) {
  let h: Harness;

  beforeEach(async () => {
    h = await makeHarness();
    await h.reset();
    await h.seedQuestions(["q-a", "q-b", "q-c"]);
  });

  afterAll(async () => {
    await h?.close();
  });

  it("creates and fetches users by id and externalId", async () => {
    const created = await h.store.createUser(baseUser);
    expect(created.id).toBeTruthy();
    expect(await h.store.getUser(created.id)).toEqual(created);
    expect(await h.store.getUserByExternalId("ext-1")).toEqual(created);
    expect(await h.store.getUser("missing")).toBeNull();
    expect(await h.store.getUserByExternalId("missing")).toBeNull();
  });

  it("updates users in place", async () => {
    const user = await h.store.createUser(baseUser);
    const updated = await h.store.updateUser({
      ...user,
      totalXp: 42,
      combo: 3,
      streakCurrent: 2,
      streakBest: 5,
      lastActiveDay: "2026-07-18",
    });
    expect(updated.totalXp).toBe(42);
    expect(await h.store.getUser(user.id)).toEqual(updated);
  });

  it("stores one daily answer per user per day", async () => {
    const user = await h.store.createUser(baseUser);
    expect(await h.store.getDailyAnswer(user.id, "2026-07-18")).toBeNull();

    const answer = {
      userId: user.id,
      day: "2026-07-18",
      questionId: "q-a",
      choiceIndex: 1,
      correct: true,
      xpAwarded: 10,
      combo: 1,
    };
    await h.store.saveDailyAnswer(answer);
    expect(await h.store.getDailyAnswer(user.id, "2026-07-18")).toEqual(answer);
    expect(await h.store.getDailyAnswer(user.id, "2026-07-19")).toBeNull();
  });

  it("upserts reviews keyed by user + question", async () => {
    const user = await h.store.createUser(baseUser);
    const created = await h.store.upsertReview({
      userId: user.id,
      questionId: "q-a",
      intervalIndex: 0,
      lapses: 1,
      dueDay: "2026-07-19",
    });
    expect(created.id).toBeTruthy();
    expect(await h.store.getReviewByQuestion(user.id, "q-a")).toEqual(created);

    const rescheduled = await h.store.upsertReview({
      ...created,
      intervalIndex: 1,
      lapses: 2,
      dueDay: "2026-07-21",
    });
    expect(rescheduled.id).toBe(created.id);
    expect(await h.store.getReview(created.id)).toEqual(rescheduled);
  });

  it("lists due reviews up to the given day, oldest first", async () => {
    const user = await h.store.createUser(baseUser);
    for (const [questionId, dueDay] of [
      ["q-a", "2026-07-20"],
      ["q-b", "2026-07-17"],
      ["q-c", "2026-07-18"],
    ] as const) {
      await h.store.upsertReview({
        userId: user.id,
        questionId,
        intervalIndex: 0,
        lapses: 0,
        dueDay,
      });
    }

    const due = await h.store.listDueReviews(user.id, "2026-07-18");
    expect(due.map((r) => r.questionId)).toEqual(["q-b", "q-c"]);
    expect(await h.store.listDueReviews(user.id, "2026-07-16")).toEqual([]);
  });

  it("deletes reviews idempotently", async () => {
    const user = await h.store.createUser(baseUser);
    const review = await h.store.upsertReview({
      userId: user.id,
      questionId: "q-a",
      intervalIndex: 0,
      lapses: 0,
      dueDay: "2026-07-19",
    });
    await h.store.deleteReview(review.id);
    expect(await h.store.getReview(review.id)).toBeNull();
    await expect(h.store.deleteReview(review.id)).resolves.toBeUndefined();
  });
}

describe("MemoryStore", () => {
  storeContract(async () => {
    let store = new MemoryStore();
    return {
      store,
      seedQuestions: async () => {},
      reset: async () => {},
      close: async () => {},
    };
  });
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("PrismaStore (TEST_DATABASE_URL)", () => {
  const db = createPrismaClient(testDatabaseUrl ?? "");

  storeContract(async () => ({
    store: new PrismaStore(db),
    seedQuestions: async (ids) => {
      for (const id of ids) {
        await db.question.upsert({
          where: { id },
          create: {
            id,
            topic: "testing",
            difficulty: 1,
            prompt: `Prompt for ${id}`,
            choices: ["a", "b"],
            answerIndex: 0,
            explanation: "because",
          },
          update: {},
        });
      }
    },
    reset: async () => {
      await db.review.deleteMany();
      await db.dailyAnswer.deleteMany();
      await db.user.deleteMany();
    },
    close: async () => {
      await db.$disconnect();
    },
  }));
});
