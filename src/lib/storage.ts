import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Synchronous key-value cache over AsyncStorage, so code written against
 * localStorage (session store, mock DB) keeps its synchronous reads.
 * `hydrateStorage()` must finish before the app renders; writes go to memory
 * immediately and to disk in the background.
 */
const memory = new Map<string, string>();

export const KEY_PREFIX = 'caresaath.';

export async function hydrateStorage(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(KEY_PREFIX));
    const values = await AsyncStorage.getMany(keys);
    for (const [k, v] of Object.entries(values)) {
      if (v != null) memory.set(k, v);
    }
  } catch {
    // Storage unavailable: start empty, data lives for this session only.
  }
}

export const kv = {
  getItem(key: string): string | null {
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
    AsyncStorage.setItem(key, value).catch(() => {});
  },
  removeItem(key: string) {
    memory.delete(key);
    AsyncStorage.removeItem(key).catch(() => {});
  },
};
