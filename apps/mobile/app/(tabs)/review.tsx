import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReviewItem } from '@sysdojo/shared';

import { QuestionCard, type QuestionCardResult } from '@/components/question-card';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api, ApiRequestError } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function ReviewScreen() {
  const { status, errorMessage, setProfile, retry } = useSession();
  const [queue, setQueue] = useState<ReviewItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuestionCardResult | null>(null);

  const loadQueue = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.getReviewQueue();
      setQueue(res.items);
      setSelected(null);
      setResult(null);
    } catch (err) {
      setLoadError(
        err instanceof ApiRequestError ? err.message : 'Could not load your review queue.',
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (status === 'ready') void loadQueue();
    }, [status, loadQueue]),
  );

  const current = queue?.[0] ?? null;

  const submit = useCallback(async () => {
    if (!current || selected === null) return;
    setSubmitting(true);
    try {
      const res = await api.answerReview(current.id, selected);
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
  }, [current, selected, setProfile]);

  // A graded item is never still due today (wrong answers reschedule for
  // tomorrow), so advancing just pops it off the local queue.
  const next = useCallback(() => {
    setQueue((q) => (q ? q.slice(1) : q));
    setSelected(null);
    setResult(null);
  }, []);

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') {
    return <ErrorState message={errorMessage ?? 'Could not sign in.'} onRetry={retry} />;
  }
  if (loadError) return <ErrorState message={loadError} onRetry={loadQueue} />;
  if (queue === null) return <LoadingState />;

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950" edges={['top']}>
      <ScrollView contentContainerClassName="px-5 pb-12 pt-4">
        <View className="mb-6 flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Review</Text>
          {queue.length > 0 ? (
            <View className="rounded-full bg-primary-600 px-3 py-1.5">
              <Text className="text-sm font-bold text-white">{queue.length} due</Text>
            </View>
          ) : null}
        </View>

        {current ? (
          <>
            <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Missed {current.lapses === 1 ? 'once' : `${current.lapses} times`} · due{' '}
              {current.dueDay}
            </Text>
            <QuestionCard
              question={current.question}
              selectedIndex={selected}
              onSelect={setSelected}
              onSubmit={() => void submit()}
              submitting={submitting}
              result={result}
              footnote="Answer correctly to push it further out — miss it and it comes back tomorrow."
            />
            {result !== null ? (
              <Pressable
                onPress={next}
                className="mt-4 h-14 flex-row items-center justify-center gap-2 rounded-2xl bg-primary-600"
              >
                <Text className="text-base font-bold text-white">
                  {queue.length > 1 ? 'Next question' : 'Done'}
                </Text>
                <IconSymbol name="arrow.right" size={18} color="#fff" />
              </Pressable>
            ) : null}
          </>
        ) : (
          <View className="mt-16 items-center gap-3 px-6">
            <Text className="text-5xl">🧘</Text>
            <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              All caught up
            </Text>
            <Text className="text-center text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Questions you miss show up here on a spaced-repetition schedule — 1, 3, 7, 14, then
              30 days — until you truly know them.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
