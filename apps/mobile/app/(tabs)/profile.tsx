import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/progress-bar';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

function StatCard({
  icon,
  color,
  label,
  value,
}: {
  icon: 'flame.fill' | 'trophy.fill' | 'bolt.fill' | 'globe';
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View className="min-w-[45%] flex-1 rounded-3xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <IconSymbol name={icon} size={20} color={color} />
      <Text className="mt-2 text-xl font-bold text-zinc-900 dark:text-zinc-50" numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-xs text-zinc-500 dark:text-zinc-400">{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { status, profile, errorMessage, setProfile, retry } = useSession();

  // Stats change on other tabs (answers award XP), so refresh on focus.
  useFocusEffect(
    useCallback(() => {
      if (status !== 'ready') return;
      api
        .getMe()
        .then(setProfile)
        .catch(() => {
          // Keep showing the last known profile if the refresh fails.
        });
    }, [status, setProfile]),
  );

  if (status === 'loading') return <LoadingState />;
  if (status === 'error' || !profile) {
    return <ErrorState message={errorMessage ?? 'Could not sign in.'} onRetry={retry} />;
  }

  const initials = profile.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950" edges={['top']}>
      <ScrollView contentContainerClassName="px-5 pb-12 pt-4">
        <View className="mb-6 flex-row items-center gap-4">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-600">
            <Text className="text-lg font-bold text-white">{initials}</Text>
          </View>
          <View>
            <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {profile.displayName}
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              system design student
            </Text>
          </View>
        </View>

        {/* Level card */}
        <View className="mb-4 rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <View className="mb-3 flex-row items-end justify-between">
            <Text className="text-3xl font-bold text-primary-600 dark:text-primary-100">
              Level {profile.level}
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {profile.xpIntoLevel} / {profile.xpForNextLevel} XP
            </Text>
          </View>
          <ProgressBar fraction={profile.xpIntoLevel / profile.xpForNextLevel} />
          <Text className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
            {profile.xpForNextLevel - profile.xpIntoLevel} XP to level {profile.level + 1}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-3">
          <StatCard
            icon="flame.fill"
            color="#f59e0b"
            label="Current streak"
            value={`${profile.streak.current} ${profile.streak.current === 1 ? 'day' : 'days'}`}
          />
          <StatCard
            icon="trophy.fill"
            color="#6366f1"
            label="Best streak"
            value={`${profile.streak.best} ${profile.streak.best === 1 ? 'day' : 'days'}`}
          />
          <StatCard icon="bolt.fill" color="#6366f1" label="Total XP" value={`${profile.totalXp}`} />
          <StatCard icon="globe" color="#22c55e" label="Timezone" value={profile.timezone} />
        </View>

        <Text className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Signed in with dev-mode auth · streaks follow your device timezone
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
