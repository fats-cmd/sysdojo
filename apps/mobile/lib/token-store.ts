import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the session lives between app launches.
 *
 * On device this is expo-secure-store: the iOS Keychain and Android's
 * EncryptedSharedPreferences, both backed by hardware-protected keys. That
 * matters because the refresh token is a long-lived bearer credential —
 * plain AsyncStorage would leave it readable on a rooted or jailbroken
 * device, and in an unencrypted device backup.
 *
 * SecureStore has no web implementation, so Expo web falls back to
 * localStorage. That is *not* equivalent security (any script on the origin
 * can read it); it exists so `npm run web` works during development.
 */

const ACCESS_TOKEN_KEY = "sysdojo.accessToken";
const REFRESH_TOKEN_KEY = "sysdojo.refreshToken";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

const webStorage = {
  getItem(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Private browsing or blocked storage: the session just won't persist.
    }
  },
  removeItem(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Nothing to do — the goal was for the value to be gone.
    }
  },
};

const isWeb = Platform.OS === "web";

async function readItem(key: string): Promise<string | null> {
  if (isWeb) return webStorage.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // A corrupt or unreadable keychain entry must not brick the app; the
    // user simply signs in again.
    return null;
  }
}

async function writeItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    // The token is only needed while someone is using the app, and this
    // keeps it out of backups restored onto a different device.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    webStorage.removeItem(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Already gone.
  }
}

export const tokenStore = {
  async load(): Promise<StoredSession | null> {
    const [accessToken, refreshToken] = await Promise.all([
      readItem(ACCESS_TOKEN_KEY),
      readItem(REFRESH_TOKEN_KEY),
    ]);
    // Without a refresh token there is no way back from an expired access
    // token, so a half-written pair counts as no session at all.
    if (!refreshToken) return null;
    return { accessToken: accessToken ?? "", refreshToken };
  },

  async save(session: StoredSession): Promise<void> {
    await Promise.all([
      writeItem(ACCESS_TOKEN_KEY, session.accessToken),
      writeItem(REFRESH_TOKEN_KEY, session.refreshToken),
    ]);
  },

  async clear(): Promise<void> {
    await Promise.all([deleteItem(ACCESS_TOKEN_KEY), deleteItem(REFRESH_TOKEN_KEY)]);
  },
};
