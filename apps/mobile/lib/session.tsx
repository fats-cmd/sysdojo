import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserProfile } from "@sysdojo/shared";
import { api, ApiRequestError } from "./api";
import { oauthAccessToken, supabaseConfigured } from "./supabase-login";

/**
 * Session state. Two modes:
 * - Dev (no Supabase env): signs in automatically on launch via the API's
 *   dev auth using the device timezone.
 * - Supabase OAuth: starts signed out; the login screen calls
 *   signInWithProvider, which exchanges the provider token for our JWT.
 * Screens update the profile from server responses (answers return the
 * fresh profile) — never by computing XP/streaks locally.
 */

type SessionStatus = "loading" | "signedOut" | "ready" | "error";

interface SessionContextValue {
  status: SessionStatus;
  profile: UserProfile | null;
  errorMessage: string | null;
  setProfile: (profile: UserProfile) => void;
  signInWithProvider: (provider: string) => void;
  retry: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(
    supabaseConfigured ? "signedOut" : "loading",
  );
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const finishLogin = useCallback((token: string, p: UserProfile) => {
    api.setToken(token);
    setProfileState(p);
    setErrorMessage(null);
    setStatus("ready");
  }, []);

  // Dev mode: auto-login on launch (and on retry()).
  useEffect(() => {
    if (supabaseConfigured) return;
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    api
      .devLogin(deviceTimezone())
      .then(({ token, profile: p }) => {
        if (!cancelled) finishLogin(token, p);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          err instanceof ApiRequestError ? err.message : "Something went wrong signing in.",
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, finishLogin]);

  const signInWithProvider = useCallback(
    (provider: string) => {
      setStatus("loading");
      setErrorMessage(null);
      oauthAccessToken(provider)
        .then((accessToken) => api.login(accessToken, deviceTimezone()))
        .then(({ token, profile: p }) => finishLogin(token, p))
        .catch((err: unknown) => {
          setErrorMessage(err instanceof Error ? err.message : "Sign-in failed.");
          setStatus("signedOut");
        });
    },
    [finishLogin],
  );

  const setProfile = useCallback((p: UserProfile) => setProfileState(p), []);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const value = useMemo(
    () => ({ status, profile, errorMessage, setProfile, signInWithProvider, retry }),
    [status, profile, errorMessage, setProfile, signInWithProvider, retry],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
