import { Router } from "express";
import {
  reviewAnswerRequestSchema,
  type ReviewAnswerResult,
  type ReviewQueueResponse,
} from "@sysdojo/shared";
import { asyncHandler, HttpError, notFound } from "../errors";
import type { AuthedRequest } from "../auth/middleware";
import { grade } from "../game/grade";
import { scheduleAfterReview } from "../game/scheduler";
import { recordActivity } from "../game/streak";
import { dayString } from "../game/time";
import { xpForAnswer } from "../game/xp";
import { toProfile, toPublicQuestion } from "../serialize";
import type { Deps } from "../server";

export function reviewRouter(deps: Deps): Router {
  const router = Router();
  const questionById = new Map(deps.questions.map((q) => [q.id, q]));

  router.get(
    "/review",
    asyncHandler<AuthedRequest>(async (req, res) => {
      const { user } = req;
      const today = dayString(new Date(), user.timezone);
      const due = await deps.store.listDueReviews(user.id, today);

      const items = [];
      for (const r of due) {
        const question = questionById.get(r.questionId);
        // Content packs can change between releases; drop orphaned items.
        if (!question) {
          await deps.store.deleteReview(r.id);
          continue;
        }
        items.push({
          id: r.id,
          question: toPublicQuestion(question),
          dueDay: r.dueDay,
          lapses: r.lapses,
        });
      }

      const response: ReviewQueueResponse = { items };
      res.json(response);
    }),
  );

  router.post(
    "/review/:id/answer",
    asyncHandler<AuthedRequest>(async (req, res) => {
      const body = reviewAnswerRequestSchema.parse(req.body);
      const { user } = req;
      const today = dayString(new Date(), user.timezone);

      const review = await deps.store.getReview(req.params.id ?? "");
      if (!review || review.userId !== user.id) throw notFound("Review item not found");
      if (review.dueDay > today) {
        throw new HttpError(409, "NOT_DUE", `Due on ${review.dueDay}, not before`);
      }

      const question = questionById.get(review.questionId);
      if (!question) {
        await deps.store.deleteReview(review.id);
        throw notFound("Question no longer exists");
      }
      if (body.choiceIndex >= question.choices.length) {
        throw new HttpError(400, "VALIDATION_ERROR", "choiceIndex out of range");
      }

      const result = grade(question, body.choiceIndex);
      const xpAwarded = xpForAnswer({
        correct: result.correct,
        difficulty: question.difficulty,
        comboBefore: user.combo,
        isReview: true,
      });
      const streak = recordActivity(
        { current: user.streakCurrent, best: user.streakBest, lastActiveDay: user.lastActiveDay },
        today,
      );

      const updated = await deps.store.updateUser({
        ...user,
        totalXp: user.totalXp + xpAwarded,
        combo: result.correct ? user.combo + 1 : 0,
        streakCurrent: streak.current,
        streakBest: streak.best,
        lastActiveDay: streak.lastActiveDay,
      });

      const schedule = scheduleAfterReview(review.intervalIndex, result.correct, today);
      let nextDueDay: string | null = null;
      if ("graduated" in schedule) {
        await deps.store.deleteReview(review.id);
      } else {
        await deps.store.upsertReview({
          ...review,
          intervalIndex: schedule.intervalIndex,
          lapses: result.correct ? review.lapses : review.lapses + 1,
          dueDay: schedule.dueDay,
        });
        nextDueDay = schedule.dueDay;
      }

      const response: ReviewAnswerResult = {
        ...result,
        xpAwarded,
        nextDueDay,
        profile: toProfile(updated),
      };
      res.json(response);
    }),
  );

  return router;
}
