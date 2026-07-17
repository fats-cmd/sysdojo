import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { PublicQuestion } from '@sysdojo/shared';
import { IconSymbol } from '@/components/ui/icon-symbol';

export interface QuestionCardResult {
  correct: boolean;
  correctChoiceIndex: number;
  explanation: string;
  xpAwarded: number;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Fundamentals',
  2: 'Intermediate',
  3: 'Advanced',
};

function DifficultyDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <View className="flex-row items-center gap-1">
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i <= level ? 'bg-accent-500' : 'bg-zinc-300 dark:bg-zinc-700'
          }`}
        />
      ))}
    </View>
  );
}

/**
 * Renders a question with selectable choices, a submit CTA, and — once the
 * server has graded the answer — the verdict and explanation. Purely
 * presentational: grading always happens on the server.
 */
export function QuestionCard({
  question,
  selectedIndex,
  onSelect,
  onSubmit,
  submitting,
  result,
  footnote,
}: {
  question: PublicQuestion;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  result: QuestionCardResult | null;
  footnote?: string;
}) {
  const graded = result !== null;

  return (
    <View className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      {/* Topic + difficulty */}
      <View className="mb-4 flex-row items-center justify-between">
        <View className="rounded-full bg-primary-50 px-3 py-1 dark:bg-primary-700/20">
          <Text className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-100">
            {question.topic.replace(/-/g, ' ')}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <DifficultyDots level={question.difficulty} />
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            {DIFFICULTY_LABELS[question.difficulty]}
          </Text>
        </View>
      </View>

      <Text className="mb-5 text-xl font-semibold leading-7 text-zinc-900 dark:text-zinc-50">
        {question.prompt}
      </Text>

      <View className="gap-3">
        {question.choices.map((choice, i) => {
          const isSelected = selectedIndex === i;
          const isCorrect = graded && i === result.correctChoiceIndex;
          const isWrongPick = graded && isSelected && !isCorrect;

          let rowClass =
            'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60';
          let chipClass = 'bg-zinc-200 dark:bg-zinc-700';
          let chipTextClass = 'text-zinc-600 dark:text-zinc-300';
          if (isCorrect) {
            rowClass = 'border-success bg-success/10';
            chipClass = 'bg-success';
            chipTextClass = 'text-white';
          } else if (isWrongPick) {
            rowClass = 'border-danger bg-danger/10';
            chipClass = 'bg-danger';
            chipTextClass = 'text-white';
          } else if (isSelected) {
            rowClass = 'border-primary-500 bg-primary-50 dark:bg-primary-700/20';
            chipClass = 'bg-primary-500';
            chipTextClass = 'text-white';
          }

          return (
            <Pressable
              key={i}
              disabled={graded || submitting}
              onPress={() => onSelect(i)}
              className={`min-h-12 flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${rowClass} ${
                graded && !isCorrect && !isWrongPick ? 'opacity-50' : ''
              }`}
            >
              <View className={`h-7 w-7 items-center justify-center rounded-full ${chipClass}`}>
                <Text className={`text-xs font-bold ${chipTextClass}`}>{LETTERS[i]}</Text>
              </View>
              <Text className="flex-1 text-base leading-6 text-zinc-800 dark:text-zinc-100">
                {choice}
              </Text>
              {isCorrect ? (
                <IconSymbol name="checkmark.circle.fill" size={20} color="#22c55e" />
              ) : isWrongPick ? (
                <IconSymbol name="xmark.circle.fill" size={20} color="#ef4444" />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {!graded ? (
        <>
          <Pressable
            disabled={selectedIndex === null || submitting}
            onPress={onSubmit}
            className={`mt-6 h-14 items-center justify-center rounded-2xl ${
              selectedIndex === null || submitting ? 'bg-primary-500/40' : 'bg-primary-600'
            }`}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-bold text-white">Check answer</Text>
            )}
          </Pressable>
          {footnote ? (
            <Text className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
              {footnote}
            </Text>
          ) : null}
        </>
      ) : (
        <View className="mt-6">
          <View
            className={`flex-row items-center gap-2 rounded-2xl px-4 py-3 ${
              result.correct ? 'bg-success/10' : 'bg-danger/10'
            }`}
          >
            <IconSymbol
              name={result.correct ? 'sparkles' : 'clock.arrow.circlepath'}
              size={18}
              color={result.correct ? '#22c55e' : '#ef4444'}
            />
            <Text
              className={`flex-1 text-sm font-semibold ${
                result.correct ? 'text-success' : 'text-danger'
              }`}
            >
              {result.correct
                ? `Correct! +${result.xpAwarded} XP`
                : `Not quite — +${result.xpAwarded} XP for trying. It'll come back in Review.`}
            </Text>
          </View>
          <View className="mt-3 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
            <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Why
            </Text>
            <Text className="text-sm leading-6 text-zinc-700 dark:text-zinc-200">
              {result.explanation}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
