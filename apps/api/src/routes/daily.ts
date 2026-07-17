import { Router } from "express";
import {
  submitAnswerRequestSchema,
  type AnswerResult,
  type DailyResponse,
} from "@sysdojo/shared";
import { asyncHandler, HttpError } from "../errors";
import type { AuthedRequest } from "../auth/middleware";
import { dailyQuestionIndex } from "../game/daily";
import { grade } from "../game/grade";
import { scheduleAfterMiss } from "../game/scheduler";
import { recordActivity } from "../game/streak";
import { dayString } from "../game/time";
import { xpForAnswer } from "../game/xp";
import { toProfile, toPublicQuestion } from "../serialize";
import type { Deps } from "../server";

function todaysQuestion(deps: Deps, timezone: string) {
  const today = dayString(new Date(), timezone);
  const question = deps.questions[dailyQuestionIndex(today, deps.questions.length)];
  if (!question) throw new HttpError(500, "NO_CONTENT", "Question pool is empty");
  return { today, question };
}

export function dailyRouter(deps: Deps): Router {
  const router = Router();

  router.get(
    "/daily",
    asyncHandler<AuthedRequest>(async (req, res) => {
      const { user } = req;
      const { today, question } = todaysQuestion(deps, user.timezone);
      const answer = await deps.store.getDailyAnswer(user.id, today);

      const response: DailyResponse = {
        date: today,
        question: toPublicQuestion(question),
        answered: answer !== null,
        result:
          answer === null
            ? null
            : {
                ...grade(question, answer.choiceIndex),
                xpAwarded: answer.xpAwarded,
                combo: answer.combo,
              },
      };
      res.json(response);
    }),
  );

  router.post(
    "/answers",
    asyncHandler<AuthedRequest>(async (req, res) => {
      const body = submitAnswerRequestSchema.parse(req.body);
      const { user } = req;
      const { today, question } = todaysQuestion(deps, user.timezone);

      if (body.questionId !== question.id) {
        throw new HttpError(409, "WRONG_QUESTION", "That is not today's question");
      }
      if (body.choiceIndex >= question.choices.length) {
        throw new HttpError(400, "VALIDATION_ERROR", "choiceIndex out of range");
      }
      if (await deps.store.getDailyAnswer(user.id, today)) {
        throw new HttpError(409, "ALREADY_ANSWERED", "Daily question already answered");
      }

      const result = grade(question, body.choiceIndex);
      const xpAwarded = xpForAnswer({
        correct: result.correct,
        difficulty: question.difficulty,
        comboBefore: user.combo,
      });
      const combo = result.correct ? user.combo + 1 : 0;
      const streak = recordActivity(
        { current: user.streakCurrent, best: user.streakBest, lastActiveDay: user.lastActiveDay },
        today,
      );

      const updated = await deps.store.updateUser({
        ...user,
        totalXp: user.totalXp + xpAwarded,
        combo,
        streakCurrent: streak.current,
        streakBest: streak.best,
        lastActiveDay: streak.lastActiveDay,
      });

      await deps.store.saveDailyAnswer({
        userId: user.id,
        day: today,
        questionId: question.id,
        choiceIndex: body.choiceIndex,
        correct: result.correct,
        xpAwarded,
        combo,
      });

      if (!result.correct) {
        const existing = await deps.store.getReviewByQuestion(user.id, question.id);
        const schedule = scheduleAfterMiss(today);
        await deps.store.upsertReview({
          id: existing?.id,
          userId: user.id,
          questionId: question.id,
          intervalIndex: schedule.intervalIndex,
          lapses: (existing?.lapses ?? 0) + 1,
          dueDay: schedule.dueDay,
        });
      }

      const response: AnswerResult = {
        ...result,
        xpAwarded,
        combo,
        profile: toProfile(updated),
      };
      res.json(response);
    }),
  );

  return router;
}
