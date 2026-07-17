import { View } from 'react-native';

/** Thin rounded progress bar, e.g. XP progress inside the current level. */
export function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.min(100, Math.max(0, fraction * 100));
  return (
    <View className="h-2 w-full overflow-hidden rounded-full bg-primary-100 dark:bg-zinc-800">
      <View className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
    </View>
  );
}
