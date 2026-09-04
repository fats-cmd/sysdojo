import Constants from "expo-constants";
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
import { tokenStore } from "./token-store";

/**
 * Typed client for the sysdojo API. Every response is validated with the
 * shared zod schemas, so the app can trust the shapes it renders. The app
 * never grades or computes XP itself — it only posts answers and renders
 * whatever the server says.
 *
 * Session handling lives here so no screen has to think about it: the client
 * holds a short-lived access token plus a rotating refresh token, persists
 * both to secure storage, and silently re-authenticates when the access
 * token expires.
 */

function defaultBaseUrl(): string {
  // On a physical device "localhost" is the phone itself. In development the
  // API runs on the same machine as Metro, and Metro's host URI (e.g.
  // "192.168.1.20:8081") carries that machine's LAN IP — reuse it.
  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (metroHost && metroHost !== "localhost" && metroHost !== "127.0.0.1") {
    return `http://${metroHost}:3000`;
  }
  // Android emulators reach the host machine via 10.0.2.2, not localhost.
  return Platform.select({
    android: "http://10.0.2.2:3000",
    default: "http://localhost:3000",
  });
}

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? defaultBaseUrl();

if (__DEV__) {
  // Shows up in the Metro/Expo console so "can't reach the API" starts with
  // knowing exactly which URL the app resolved.
  console.log(`[sysdojo] API base URL: ${API_BASE_URL} (platform: ${Platform.OS})`);
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

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
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  /** Shared across callers so a burst of 401s triggers exactly one refresh —
   *  rotating the same token twice would trip the server's reuse detection
   *  and revoke the whole session. */
  private refreshInFlight: Promise<boolean> | null = null;
  /** Called when the session is gone for good and the UI must show sign-in. */
  private onSessionEnded: (() => void) | null = null;

  setSessionEndedHandler(handler: (() => void) | null) {
    this.onSessionEnded = handler;
  }

  /** Rehydrate a session saved by a previous launch. */
  async restoreSession(): Promise<boolean> {
    const stored = await tokenStore.load();
    if (!stored) return false;
    this.accessToken = stored.accessToken || null;
    this.refreshToken = stored.refreshToken;
    return true;
  }

  private async adoptSession(auth: AuthResponse): Promise<AuthResponse> {
    this.accessToken = auth.accessToken;
    this.refreshToken = auth.refreshToken;
    await tokenStore.save({
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
    });
    return auth;
  }

  private async clearSession(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    await tokenStore.clear();
  }

  private async send(method: Method, path: string, body?: unknown): Promise<Response> {
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
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
  }

  private async raise(response: Response): Promise<never> {
    const json: unknown = await response.json().catch(() => null);
    const parsed = apiErrorSchema.safeParse(json);
    if (parsed.success) {
      throw new ApiRequestError(parsed.data.error.code, parsed.data.error.message, response.status);
    }
    throw new ApiRequestError("UNKNOWN", `Request failed (${response.status})`, response.status);
  }

  /**
   * Swap the refresh token for a new pair. Concurrent callers share one
   * request; the result says whether we still have a usable session.
   */
  private refreshSession(): Promise<boolean> {
    this.refreshInFlight ??= (async () => {
      try {
        if (!this.refreshToken) return false;
        const response = await this.send("POST", "/v1/auth/refresh", {
          refreshToken: this.refreshToken,
        });
        if (!response.ok) {
          // 5xx means the API or the auth provider is briefly unavailable —
          // keep the token and let the next attempt succeed. Only a 4xx is
          // the server saying this session is finished.
          if (response.status >= 500) return false;
          await this.clearSession();
          this.onSessionEnded?.();
          return false;
        }
        await this.adoptSession(authResponseSchema.parse(await response.json()));
        return true;
      } catch {
        // Network failure: the session may still be fine, so keep it.
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  private async request<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const response = await this.requestRaw(method, path, body);
    return schema.parse(await response.json());
  }

  /** For 204 endpoints, where there is no body to validate. */
  private async requestRaw(method: Method, path: string, body?: unknown): Promise<Response> {
    let response = await this.send(method, path, body);

    // One retry, and only when we hold a refresh token: a 401 on a request
    // made without any session is simply unauthenticated.
    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshSession();
      if (refreshed) response = await this.send(method, path, body);
    }

    if (!response.ok) await this.raise(response);
    return response;
  }

  // ---- auth ----

  /** Dev-mode sign-in. Rejected by any server with real auth configured. */
  async devLogin(timezone: string, displayName?: string): Promise<AuthResponse> {
    const response = await this.send("POST", "/v1/auth/dev", { timezone, displayName });
    if (!response.ok) await this.raise(response);
    return this.adoptSession(authResponseSchema.parse(await response.json()));
  }

  /** Exchange a provider credential (Supabase access token) for our session. */
  async login(credential: string, timezone: string, displayName?: string): Promise<AuthResponse> {
    const response = await this.send("POST", "/v1/auth/login", {
      credential,
      timezone,
      displayName,
    });
    if (!response.ok) await this.raise(response);
    return this.adoptSession(authResponseSchema.parse(await response.json()));
  }

  /** Sign out this device, revoking the refresh token server-side. */
  async logout(): Promise<void> {
    const token = this.refreshToken;
    // Clear locally first: the user asked to be signed out, and that must
    // happen even if the network call fails.
    await this.clearSession();
    if (!token) return;
    try {
      await this.send("POST", "/v1/auth/logout", { refreshToken: token });
    } catch {
      // The token expires on its own; nothing more to do here.
    }
  }

  /** Sign out on every device. */
  async logoutAll(): Promise<void> {
    try {
      await this.requestRaw("POST", "/v1/me/logout-all");
    } finally {
      await this.clearSession();
    }
  }

  /** Permanently delete the account and all its data. */
  async deleteAccount(): Promise<void> {
    await this.requestRaw("DELETE", "/v1/me");
    await this.clearSession();
  }

  /** True when a saved session exists (it may still need refreshing). */
  hasSession(): boolean {
    return this.refreshToken !== null;
  }

  // ---- game ----

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
