import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { useSession } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase-login';

/**
 * Sign-out and account deletion.
 *
 * Deletion is not optional polish: App Store guideline 5.1.1(v) requires any
 * app offering account creation to offer in-app deletion too. It is
 * irreversible and confirmed twice.
 */
export function AccountActions() {
  const { signOut, signOutEverywhere, deleteAccount } = useSession();
  const [busy, setBusy] = useState<null | 'signOut' | 'signOutAll' | 'delete'>(null);

  function run(kind: NonNullable<typeof busy>, action: () => Promise<void>, failure: string) {
    setBusy(kind);
    action()
      .catch((err: unknown) => {
        Alert.alert(failure, err instanceof Error ? err.message : 'Please try again.');
      })
      .finally(() => setBusy(null));
  }

  function confirmDelete() {
    Alert.alert(
      'Delete account?',
      'This permanently erases your XP, streak, and review history. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            run('delete', deleteAccount, 'Could not delete your account'),
        },
      ],
    );
  }

  function confirmSignOutEverywhere() {
    Alert.alert(
      'Sign out everywhere?',
      'Every device signed in to this account will be signed out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out all',
          style: 'destructive',
          onPress: () =>
            run('signOutAll', signOutEverywhere, 'Could not sign out everywhere'),
        },
      ],
    );
  }

  return (
    <View className="mt-8 gap-3">
      {/* Dev builds sign straight back in, so a sign-out button there would
          look broken. The other actions still work and are worth testing. */}
      {supabaseConfigured ? (
        <ActionButton
          label="Sign out"
          busy={busy === 'signOut'}
          disabled={busy !== null}
          onPress={() => run('signOut', signOut, 'Could not sign out')}
        />
      ) : null}

      <ActionButton
        label="Sign out on all devices"
        busy={busy === 'signOutAll'}
        disabled={busy !== null}
        onPress={confirmSignOutEverywhere}
      />

      <ActionButton
        label="Delete account"
        destructive
        busy={busy === 'delete'}
        disabled={busy !== null}
        onPress={confirmDelete}
      />
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  busy,
  disabled,
  destructive,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      className={`items-center rounded-2xl border px-4 py-3 active:opacity-70 ${
        destructive
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
          : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {busy ? (
        <ActivityIndicator />
      ) : (
        <Text
          className={`font-semibold ${
            destructive ? 'text-red-600 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-200'
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
