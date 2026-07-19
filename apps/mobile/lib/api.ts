import { Platform } from "react-native";
import {
  apiErrorSchema,
  authResponseSchema,
  dailyResponseSchema,
  reviewAnswerResultSchema,
  reviewQueueResponseSchema,
  userProfileSchema,
  type AnswerResult,
  answerResultSchema,
  type AuthResponse,
  type DailyResponse,
  type ReviewAnswerResult,
  type ReviewQueueResponse,
  type UserProfile,
} from "@sysdojo/shared";
import type { z } from "zod";

/**
 * Typed client for the sysdojo API. Every response is validated with the
 * shared zod schemas, so the app can trust the shapes it renders. The app
 * never grades or computes XP itself — it only posts answers and renders
 * whatever the server says.
 */

// Android emulators reach the host machine via 10.0.2.2, not localhost.
const DEFAULT_BASE_URL = Platform.select({
  android: "http://10.0.2.2:3000",
  default: "http://localhost:3000",
});

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_BASE_URL;

if (__DEV__) {
  // Shows up in the Metro/Expo console so "can't reach the API" starts with
  // knowing exactly which URL the app resolved.
  console.log(`[sysdojo] API base URL: ${API_BASE_URL} (platform: ${Platform.OS})`);
}

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError(
        "NETWORK",
        `Cannot reach the sysdojo API at ${API_BASE_URL}. Is it running? (npm run dev:api)`,
        0,
      );
    }

    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(json);
      if (parsed.success) {
        throw new ApiRequestError(
          parsed.data.error.code,
          parsed.data.error.message,
          response.status,
        );
      }
      throw new ApiRequestError("UNKNOWN", `Request failed (${response.status})`, response.status);
    }
    return schema.parse(json);
  }

  devLogin(timezone: string, displayName?: string): Promise<AuthResponse> {
    return this.request("POST", "/v1/auth/dev", authResponseSchema, { timezone, displayName });
  }

  getDaily(): Promise<DailyResponse> {
    return this.request("GET", "/v1/daily", dailyResponseSchema);
  }

  submitAnswer(questionId: string, choiceIndex: number): Promise<AnswerResult> {
    return this.request("POST", "/v1/answers", answerResultSchema, { questionId, choiceIndex });
  }

  getReviewQueue(): Promise<ReviewQueueResponse> {
    return this.request("GET", "/v1/review", reviewQueueResponseSchema);
  }

  answerReview(reviewId: string, choiceIndex: number): Promise<ReviewAnswerResult> {
    return this.request("POST", `/v1/review/${reviewId}/answer`, reviewAnswerResultSchema, {
      choiceIndex,
    });
  }

  getMe(): Promise<UserProfile> {
    return this.request("GET", "/v1/me", userProfileSchema);
  }
}

export const api = new ApiClient();
