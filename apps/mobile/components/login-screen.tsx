import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { oauthProviders } from "@/lib/supabase-login";
import { useSession } from "@/lib/session";

function providerLabel(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Shown when Supabase auth is configured and the user has no session yet. */
export function LoginScreen() {
  const { status, errorMessage, signInWithProvider } = useSession();
  const busy = status === "loading";

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-white px-8 dark:bg-zinc-950">
      <Text className="text-4xl">🥋</Text>
      <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">sysdojo</Text>
      <Text className="text-center text-zinc-500 dark:text-zinc-400">
        One system-design question a day. Sign in to keep your streak.
      </Text>

      {busy ? (
        <ActivityIndicator />
      ) : (
        <View className="w-full gap-3">
          {oauthProviders.map((provider: string) => (
            <Pressable
              key={provider}
              onPress={() => signInWithProvider(provider)}
              className="items-center rounded-xl bg-indigo-500 px-4 py-3 active:opacity-80"
            >
              <Text className="font-semibold text-white">
                Continue with {providerLabel(provider)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {errorMessage ? (
        <Text className="text-center text-sm text-red-500">{errorMessage}</Text>
      ) : null}
    </View>
  );
}
