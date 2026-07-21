import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

/**
 * Supabase OAuth for Expo. The app opens the provider's page in an auth
 * browser session; Supabase redirects back into the app (sysdojo:// deep
 * link) with tokens; we hand the access token to our API, which verifies
 * it server-side and issues its own JWT. The Supabase session is never
 * persisted on the device — the API JWT is the app's real session.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** When unset the app stays in zero-config dev-login mode. */
export const supabaseConfigured = Boolean(url && anonKey);

/** Comma-separated provider allowlist, e.g. "github,google". */
export const oauthProviders: string[] = (
  process.env.EXPO_PUBLIC_OAUTH_PROVIDERS ?? "github,google"
)
  .split(",")
  .map((p: string) => p.trim())
  .filter(Boolean);

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!url || !anonKey) throw new Error("Supabase is not configured");
  client ??= createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Runs the OAuth dance and resolves to a Supabase access token. */
export async function oauthAccessToken(provider: string): Promise<string> {
  const redirectTo = Linking.createURL("auth/callback");

  const { data, error } = await supabase().auth.signInWithOAuth({
    // Cast: provider strings are validated by Supabase itself; keeping the
    // list env-configurable beats hardcoding the union type here.
    provider: provider as "github",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new Error(error?.message ?? "Could not start OAuth flow");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") throw new Error("Sign-in was cancelled");

  return tokenFromCallbackUrl(result.url);
}

/**
 * Extract the access token from the OAuth callback URL. PKCE puts a
 * one-time `?code=` in the query (exchanged via the same client that
 * holds the verifier); the implicit flow returns tokens in the #fragment.
 */
export async function tokenFromCallbackUrl(callbackUrl: string): Promise<string> {
  const fragment = callbackUrl.split("#")[1];
  const fragmentToken = fragment
    ? new URLSearchParams(fragment).get("access_token")
    : null;
  if (fragmentToken) return fragmentToken;

  const query = callbackUrl.split("?")[1]?.split("#")[0];
  const code = query ? new URLSearchParams(query).get("code") : null;
  if (code) {
    const { data, error } = await supabase().auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      throw new Error(error?.message ?? "Could not exchange OAuth code");
    }
    return data.session.access_token;
  }

  throw new Error("OAuth callback carried no token");
}
