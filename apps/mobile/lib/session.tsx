import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UserProfile } from "@sysdojo/shared";
import { api, ApiRequestError } from "./api";
import { oauthAccessToken, supabaseConfigured } from "./supabase-login";

/**
 * Session state for the whole app.
 *
 * On launch we try to restore the session saved in secure storage, so a
 * returning user lands straight on today's question — no sign-in, no OAuth
 * round trip. The API client refreshes the access token underneath us; this
 * provider only hears about it when the session is gone for good.
 *
 * Two modes:
 * - Dev (no Supabase env): signs in automatically via the API's dev auth.
 * - Supabase OAuth: starts signed out; the login screen calls
 *   signInWithProvider, which exchanges the provider token for our session.
 *
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
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError || err instanceof Error ? err.message : fallback;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelled = useRef(false);

  // The API client signs us out when a refresh is refused (expired, revoked,
  // or reuse detected server-side). Nothing else can tell us that.
  useEffect(() => {
    api.setSessionEndedHandler(() => {
      setProfileState(null);
      setStatus("signedOut");
      setErrorMessage("Your session ended. Please sign in again.");
    });
    return () => api.setSessionEndedHandler(null);
  }, []);

  // Bootstrap. The "loading" state is set by whoever triggers a run (initial
  // state on mount, retry()/endSession() afterwards) rather than in here —
  // setting state synchronously inside an effect causes a cascading render.
  useEffect(() => {
    cancelled.current = false;

    void (async () => {
      // 1. A session saved by a previous launch.
      if (await api.restoreSession()) {
        try {
          const restored = await api.getMe();
          if (cancelled.current) return;
          setProfileState(restored);
          setStatus("ready");
          return;
        } catch (err) {
          if (cancelled.current) return;
          // The API is unreachable — the saved session is probably fine, so
          // offer a retry instead of throwing the user back to sign-in.
          if (err instanceof ApiRequestError && err.status === 0) {
            setErrorMessage(err.message);
            setStatus("error");
            return;
          }
          // Anything else means the session is finished; fall through.
        }
      }

      // 2. No usable session. With real auth the user has to sign in.
      if (supabaseConfigured) {
        if (!cancelled.current) setStatus("signedOut");
        return;
      }

      // 3. Dev mode: sign in automatically so there's zero setup locally.
      try {
        const { profile: p } = await api.devLogin(deviceTimezone());
        if (cancelled.current) return;
        setProfileState(p);
        setStatus("ready");
      } catch (err) {
        if (cancelled.current) return;
        setErrorMessage(messageFor(err, "Something went wrong signing in."));
        setStatus("error");
      }
    })();

    return () => {
      cancelled.current = true;
    };
  }, [attempt]);

  const signInWithProvider = useCallback((provider: string) => {
    setStatus("loading");
    setErrorMessage(null);
    oauthAccessToken(provider)
      .then((accessToken) => api.login(accessToken, deviceTimezone()))
      .then(({ profile: p }) => {
        setProfileState(p);
        setErrorMessage(null);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        setErrorMessage(messageFor(err, "Sign-in failed."));
        setStatus("signedOut");
      });
  }, []);

  /** Drop local state and show the right screen for this build's auth mode. */
  const endSession = useCallback((message: string | null) => {
    setProfileState(null);
    setErrorMessage(message);
    // Dev mode has no sign-in screen — bouncing through the bootstrap effect
    // signs a fresh dev user straight back in.
    if (supabaseConfigured) {
      setStatus("signedOut");
    } else {
      setStatus("loading");
      setAttempt((a) => a + 1);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    endSession(null);
  }, [endSession]);

  const signOutEverywhere = useCallback(async () => {
    try {
      await api.logoutAll();
    } finally {
      endSession(null);
    }
  }, [endSession]);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    endSession(null);
  }, [endSession]);

  const setProfile = useCallback((p: UserProfile) => setProfileState(p), []);
  const retry = useCallback(() => {
    setErrorMessage(null);
    setStatus("loading");
    setAttempt((a) => a + 1);
  }, []);

  const value = useMemo(
    () => ({
      status,
      profile,
      errorMessage,
      setProfile,
      signInWithProvider,
      signOut,
      signOutEverywhere,
      deleteAccount,
      retry,
    }),
    [
      status,
      profile,
      errorMessage,
      setProfile,
      signInWithProvider,
      signOut,
      signOutEverywhere,
      deleteAccount,
      retry,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
