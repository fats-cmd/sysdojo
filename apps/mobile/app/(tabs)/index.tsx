import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DailyResponse } from '@sysdojo/shared';

import { QuestionCard, type QuestionCardResult } from '@/components/question-card';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api, ApiRequestError } from '@/lib/api';
import { useSession } from '@/lib/session';

function StatPill({
  icon,
  value,
  color,
}: {
  icon: 'flame.fill' | 'bolt.fill';
  value: string;
  color: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-white px-3 py-1.5 dark:bg-zinc-900">
      <IconSymbol name={icon} size={16} color={color} />
      <Text className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{value}</Text>
    </View>
  );
}

export default function TodayScreen() {
  const { status, profile, errorMessage, setProfile, retry } = useSession();
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuestionCardResult | null>(null);

  const loadDaily = useCallback(async () => {
    setLoadError(null);
    try {
      const d = await api.getDaily();
      setDaily(d);
      setResult(d.result);
      setSelected(null);
    } catch (err) {
      setLoadError(
        err instanceof ApiRequestError ? err.message : 'Could not load today’s question.',
      );
    }
  }, []);

  useEffect(() => {
    if (status === 'ready') void loadDaily();
  }, [status, loadDaily]);

  const submit = useCallback(async () => {
    if (!daily || selected === null) return;
    setSubmitting(true);
    try {
      const res = await api.submitAnswer(daily.question.id, selected);
      setResult(res);
      setProfile(res.profile);
      void Haptics.notificationAsync(
        res.correct
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : 'Could not submit your answer.');
    } finally {
      setSubmitting(false);
    }
  }, [daily, selected, setProfile]);

  if (status === 'loading') return <LoadingState />;
  if (status === 'error' || !profile) {
    return <ErrorState message={errorMessage ?? 'Could not sign in.'} onRetry={retry} />;
  }
  if (loadError) return <ErrorState message={loadError} onRetry={loadDaily} />;
  if (!daily) return <LoadingState />;

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950" edges={['top']}>
      <ScrollView contentContainerClassName="px-5 pb-12 pt-4">
        {/* Header: greeting + streak/XP */}
        <View className="mb-6 flex-row items-center justify-between">
          <View>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">{daily.date}</Text>
            <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              Hey {profile.displayName.split(' ')[0]} 👋
            </Text>
          </View>
          <View className="flex-row gap-2">
            <StatPill icon="flame.fill" value={`${profile.streak.current}`} color="#f59e0b" />
            <StatPill icon="bolt.fill" value={`${profile.totalXp}`} color="#6366f1" />
          </View>
        </View>

        <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Today’s kata
        </Text>

        <QuestionCard
          question={daily.question}
          selectedIndex={selected}
          onSelect={setSelected}
          onSubmit={() => void submit()}
          submitting={submitting}
          result={result}
          footnote="One question a day. Miss it and it joins your review queue."
        />

        {result !== null ? (
          <Text className="mt-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
            That’s today’s kata done — come back tomorrow to keep your streak of{' '}
            {profile.streak.current} {profile.streak.current === 1 ? 'day' : 'days'} alive. 🔥
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
