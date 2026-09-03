import { z } from "zod";

/** Error envelope used by every /v1 endpoint. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** A question as exposed to clients — never includes the answer key. */
export const publicQuestionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prompt: z.string(),
  choices: z.array(z.string()),
});
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;

export const streakSchema = z.object({
  current: z.number().int().nonnegative(),
  best: z.number().int().nonnegative(),
  /** Last day (YYYY-MM-DD in the user's timezone) the user answered. */
  lastActiveDay: z.string().nullable(),
});
export type Streak = z.infer<typeof streakSchema>;

export const userProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  /** IANA timezone, e.g. "Africa/Lagos". Drives the daily boundary. */
  timezone: z.string(),
  totalXp: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  /** XP accumulated inside the current level. */
  xpIntoLevel: z.number().int().nonnegative(),
  /** XP needed to go from the current level to the next. */
  xpForNextLevel: z.number().int().positive(),
  streak: streakSchema,
});
export type UserProfile = z.infer<typeof userProfileSchema>;

// ---- auth ----

export const devLoginRequestSchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  timezone: z.string().min(1),
});
export type DevLoginRequest = z.infer<typeof devLoginRequestSchema>;

/** Provider login: `credential` is the auth provider's token
 *  (e.g. a Supabase access token), verified server-side by the adapter. */
export const loginRequestSchema = z.object({
  credential: z.string().min(1),
  displayName: z.string().min(1).max(40).optional(),
  timezone: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Sessions are a short-lived access token plus a long-lived, single-use
 * refresh token. The client stores both in secure storage, sends the access
 * token on every request, and swaps the refresh token for a new pair when
 * the access token expires. Refresh tokens rotate on every use.
 */
export const authResponseSchema = z.object({
  /** Signed JWT for the Authorization header. Short-lived. */
  accessToken: z.string(),
  /** Opaque, single-use token that mints the next pair. */
  refreshToken: z.string(),
  /** Access-token lifetime in seconds, so clients can refresh proactively. */
  expiresIn: z.number().int().positive(),
  profile: userProfileSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** Sign-out revokes the whole rotation family the token belongs to. */
export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

// ---- daily question ----

export const answerResultSchema = z.object({
  correct: z.boolean(),
  correctChoiceIndex: z.number().int().nonnegative(),
  explanation: z.string(),
  xpAwarded: z.number().int().nonnegative(),
  /** Consecutive-correct combo count after this answer. */
  combo: z.number().int().nonnegative(),
  profile: userProfileSchema,
});
export type AnswerResult = z.infer<typeof answerResultSchema>;

export const dailyResponseSchema = z.object({
  /** The user's current day, YYYY-MM-DD in their timezone. */
  date: z.string(),
  question: publicQuestionSchema,
  answered: z.boolean(),
  /** Present when the user already answered today. */
  result: answerResultSchema.omit({ profile: true }).nullable(),
});
export type DailyResponse = z.infer<typeof dailyResponseSchema>;

export const submitAnswerRequestSchema = z.object({
  questionId: z.string(),
  choiceIndex: z.number().int().nonnegative(),
});
export type SubmitAnswerRequest = z.infer<typeof submitAnswerRequestSchema>;

// ---- spaced-repetition review ----

export const reviewItemSchema = z.object({
  id: z.string(),
  question: publicQuestionSchema,
  /** Day the item became due, YYYY-MM-DD in the user's timezone. */
  dueDay: z.string(),
  /** How many times this question has been missed. */
  lapses: z.number().int().positive(),
});
export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const reviewQueueResponseSchema = z.object({
  items: z.array(reviewItemSchema),
});
export type ReviewQueueResponse = z.infer<typeof reviewQueueResponseSchema>;

export const reviewAnswerRequestSchema = z.object({
  choiceIndex: z.number().int().nonnegative(),
});
export type ReviewAnswerRequest = z.infer<typeof reviewAnswerRequestSchema>;

export const reviewAnswerResultSchema = z.object({
  correct: z.boolean(),
  correctChoiceIndex: z.number().int().nonnegative(),
  explanation: z.string(),
  xpAwarded: z.number().int().nonnegative(),
  /** Next due day, or null when the item graduated out of review. */
  nextDueDay: z.string().nullable(),
  profile: userProfileSchema,
});
export type ReviewAnswerResult = z.infer<typeof reviewAnswerResultSchema>;

// ---- profile ----

export const updateProfileRequestSchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  timezone: z.string().min(1).optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
