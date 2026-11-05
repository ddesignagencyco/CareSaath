import * as Keychain from 'react-native-keychain';
import { kv } from './storage';

/**
 * Synchronous cache over the OS secure store (Android Keystore / iOS Keychain)
 * for secrets: the session tokens. Same shape as `kv`, so the session store
 * keeps its synchronous reads. `hydrateSecureStorage()` must finish before the
 * app renders; writes go to memory immediately and to the keystore in the
 * background, one at a time per key so they can never land out of order.
 *
 * Earlier builds kept the tokens in plain AsyncStorage. On first launch after
 * the upgrade, hydration moves any such value into the keystore and deletes
 * the plain copy, so signed-in users stay signed in.
 */
const memory = new Map<string, string>();
const pending = new Map<string, Promise<unknown>>();

const OPTIONS = {
  // Readable after the first unlock so background refresh and push handlers
  // still work while the phone is locked; never synced to another device.
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
};

function enqueue(key: string, write: () => Promise<unknown>) {
  const next = (pending.get(key) ?? Promise.resolve()).then(write, write).catch(() => {});
  pending.set(key, next);
}

/** Load `keys` from the keystore, migrating any legacy plain copy. Run after `hydrateStorage()`. */
export async function hydrateSecureStorage(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async key => {
      try {
        const stored = await Keychain.getGenericPassword({ service: key });
        if (stored) {
          memory.set(key, stored.password);
        } else {
          const legacy = kv.getItem(key);
          if (legacy != null) {
            memory.set(key, legacy);
            await Keychain.setGenericPassword(key, legacy, { service: key, ...OPTIONS });
          }
        }
      } catch {
        // Keystore unavailable: fall back to a legacy copy for this launch only.
        const legacy = kv.getItem(key);
        if (legacy != null) memory.set(key, legacy);
        return;
      }
      // Whether migrated just now or already in the keystore, no plain copy stays behind.
      if (kv.getItem(key) != null) kv.removeItem(key);
    }),
  );
}

export const secureKv = {
  getItem(key: string): string | null {
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
    enqueue(key, () => Keychain.setGenericPassword(key, value, { service: key, ...OPTIONS }));
  },
  removeItem(key: string) {
    memory.delete(key);
    enqueue(key, () => Keychain.resetGenericPassword({ service: key }));
  },
};
