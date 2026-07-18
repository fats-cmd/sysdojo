import type { ContentQuestion } from "@sysdojo/shared";
import type { PrismaClient } from "../generated/prisma/client";

/**
 * Upsert the validated YAML content pack into Postgres so answers and
 * reviews have referential integrity. YAML stays the source of truth;
 * this runs at every API startup and is idempotent. Questions removed
 * from the pack are kept in the DB (past answers may reference them) —
 * routes already drop orphaned review items.
 */
export async function syncQuestions(
  db: PrismaClient,
  questions: ContentQuestion[],
): Promise<void> {
  await db.$transaction(
    questions.map((q) => {
      const data = {
        topic: q.topic,
        difficulty: q.difficulty,
        prompt: q.prompt,
        choices: q.choices,
        answerIndex: q.answerIndex,
        explanation: q.explanation,
      };
      return db.question.upsert({
        where: { id: q.id },
        create: { id: q.id, ...data },
        update: data,
      });
    }),
  );
}
