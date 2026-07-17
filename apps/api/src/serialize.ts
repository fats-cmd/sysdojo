import type { ContentQuestion, PublicQuestion, UserProfile } from "@sysdojo/shared";
import { levelFromTotalXp } from "./game/xp";
import type { UserRecord } from "./store/store";

export function toProfile(user: UserRecord): UserProfile {
  const { level, xpIntoLevel, xpForNextLevel } = levelFromTotalXp(user.totalXp);
  return {
    id: user.id,
    displayName: user.displayName,
    timezone: user.timezone,
    totalXp: user.totalXp,
    level,
    xpIntoLevel,
    xpForNextLevel,
    streak: {
      current: user.streakCurrent,
      best: user.streakBest,
      lastActiveDay: user.lastActiveDay,
    },
  };
}

/** Strip the answer key — clients must never see it before grading. */
export function toPublicQuestion(q: ContentQuestion): PublicQuestion {
  return {
    id: q.id,
    topic: q.topic,
    difficulty: q.difficulty,
    prompt: q.prompt,
    choices: q.choices,
  };
}
