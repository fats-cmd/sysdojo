import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import '../global.css';
import { LoginScreen } from '@/components/login-screen';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SessionProvider, useSession } from '@/lib/session';
import { supabaseConfigured } from '@/lib/supabase-login';

export const unstable_settings = {
  anchor: '(tabs)',
};

/** With real auth configured, the app is only reachable once signed in.
 *  Dev mode auto-logs-in, so the gate never shows there. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  if (supabaseConfigured && status !== 'ready') return <LoginScreen />;
  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SessionProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthGate>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </AuthGate>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SessionProvider>
  );
}
