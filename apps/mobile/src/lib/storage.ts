import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session storage: Keychain/Keystore on devices (expo-secure-store), browser storage on web previews.
 * SecureStore values have a size limit, so long values (Supabase sessions) are split into chunks.
 */
const CHUNK = 1800;

const web = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
  del: (k: string) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
};

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return web.get(key);
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (!count) return SecureStore.getItemAsync(key);
    const parts = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return web.set(key, value);
    await secureStorage.removeItem(key);
    if (value.length <= CHUNK) return SecureStore.setItemAsync(key, value);
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') return web.del(key);
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (count) {
      await Promise.all(
        Array.from({ length: Number(count) }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)),
      );
      await SecureStore.deleteItemAsync(`${key}.n`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};
