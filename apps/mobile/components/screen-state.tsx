import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export function LoadingState() {
  return (
    <View className="flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-zinc-50 px-8 dark:bg-zinc-950">
      <Text className="text-center text-4xl">🥋</Text>
      <Text className="text-center text-base leading-6 text-zinc-600 dark:text-zinc-300">
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        className="h-12 items-center justify-center rounded-2xl bg-primary-600 px-8"
      >
        <Text className="font-bold text-white">Try again</Text>
      </Pressable>
    </View>
  );
}
