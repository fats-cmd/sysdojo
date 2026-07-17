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

/**
 * Session state: signs in on launch via the API's dev auth using the device
 * timezone, and holds the latest profile. Screens update the profile from
 * server responses (answers return the fresh profile) — never by computing
 * XP/streaks locally.
 */

type SessionStatus = "loading" | "ready" | "error";

interface SessionContextValue {
  status: SessionStatus;
  profile: UserProfile | null;
  errorMessage: string | null;
  setProfile: (profile: UserProfile) => void;
  retry: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    api
      .devLogin(deviceTimezone())
      .then(({ token, profile }) => {
        if (cancelled) return;
        api.setToken(token);
        setProfileState(profile);
        setStatus("ready");
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
  }, [attempt]);

  const setProfile = useCallback((p: UserProfile) => setProfileState(p), []);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const value = useMemo(
    () => ({ status, profile, errorMessage, setProfile, retry }),
    [status, profile, errorMessage, setProfile, retry],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
