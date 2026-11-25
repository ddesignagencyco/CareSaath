import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from 'baileys';
import type { PrismaService } from '../common/prisma/prisma.service.js';

export const BAILEYS_KEY_PREFIX = 'baileys.';
export const BAILEYS_CREDS_KEY = `${BAILEYS_KEY_PREFIX}creds`;
export const BAILEYS_META_KEY = `${BAILEYS_KEY_PREFIX}meta`;

export interface BaileysSessionMeta {
  linkedAt: string;
  expiresAt: string;
  expiryNotified: boolean;
}

function makeDbKey(type: string, id: string): string {
  return `${BAILEYS_KEY_PREFIX}${type}-${id}`;
}

function serialize(data: unknown): string {
  return JSON.stringify(data, BufferJSON.replacer);
}

function deserialize<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw, BufferJSON.reviver) as T;
  } catch {
    return null;
  }
}

/**
 * PostgreSQL-backed Baileys auth state using CareSaath's existing `PlatformConfig` table.
 * Zero files written to local disk — safe across Render redeploys and container restarts.
 */
export async function usePrismaAuthState(prisma: PrismaService): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const credsRow = await prisma.platformConfig.findUnique({
    where: { key: BAILEYS_CREDS_KEY },
  });

  const creds: AuthenticationCreds =
    (credsRow ? deserialize<AuthenticationCreds>(credsRow.value) : null) ?? initAuthCreds();

  const saveCreds = async (): Promise<void> => {
    const encoded = serialize(creds);
    await prisma.platformConfig.upsert({
      where: { key: BAILEYS_CREDS_KEY },
      update: { value: encoded },
      create: { key: BAILEYS_CREDS_KEY, value: encoded },
    });
  };

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const result: { [id: string]: SignalDataTypeMap[T] } = {};
          if (ids.length === 0) return result;

          const dbKeys = ids.map((id) => makeDbKey(type, id));
          const rows = await prisma.platformConfig.findMany({
            where: { key: { in: dbKeys } },
          });
          const byKey = new Map(rows.map((r) => [r.key, r.value]));

          for (const id of ids) {
            const raw = byKey.get(makeDbKey(type, id));
            if (raw == null) continue;
            let parsed = deserialize<SignalDataTypeMap[T]>(raw);
            if (type === 'app-state-sync-key' && parsed) {
              parsed = proto.Message.AppStateSyncKeyData.fromObject(
                parsed as Record<string, unknown>,
              ) as unknown as SignalDataTypeMap[T];
            }
            if (parsed) {
              result[id] = parsed;
            }
          }
          return result;
        },

        set: async (data) => {
          const ops: Promise<unknown>[] = [];

          for (const category of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
            const entries = data[category];
            if (!entries) continue;

            for (const [id, value] of Object.entries(entries)) {
              const key = makeDbKey(category, id);
              if (value != null) {
                const encoded = serialize(value);
                ops.push(
                  prisma.platformConfig.upsert({
                    where: { key },
                    update: { value: encoded },
                    create: { key, value: encoded },
                  }),
                );
              } else {
                ops.push(
                  prisma.platformConfig.deleteMany({
                    where: { key },
                  }),
                );
              }
            }
          }

          await Promise.all(ops);
        },
      },
    },
    saveCreds,
  };
}

/** Reads the 30-day session lifecycle metadata from PostgreSQL. */
export async function getBaileysSessionMeta(
  prisma: PrismaService,
): Promise<BaileysSessionMeta | null> {
  const row = await prisma.platformConfig.findUnique({
    where: { key: BAILEYS_META_KEY },
  });
  if (!row || !row.value || typeof row.value !== 'object') return null;
  const v = row.value as Partial<BaileysSessionMeta>;
  if (typeof v.linkedAt !== 'string' || typeof v.expiresAt !== 'string') return null;
  return {
    linkedAt: v.linkedAt,
    expiresAt: v.expiresAt,
    expiryNotified: Boolean(v.expiryNotified),
  };
}

/** Persists the 30-day session lifecycle metadata in PostgreSQL. */
export async function saveBaileysSessionMeta(
  prisma: PrismaService,
  meta: BaileysSessionMeta,
): Promise<void> {
  await prisma.platformConfig.upsert({
    where: { key: BAILEYS_META_KEY },
    update: { value: { ...meta } },
    create: { key: BAILEYS_META_KEY, value: { ...meta } },
  });
}

/** Wipes all `baileys.*` rows from PostgreSQL (used on logout or 30-day expiry). */
export async function clearAllBaileysAuthData(prisma: PrismaService): Promise<number> {
  const res = await prisma.platformConfig.deleteMany({
    where: { key: { startsWith: BAILEYS_KEY_PREFIX } },
  });
  return res.count;
}

/**
 * Prunes stale per-recipient Signal E2EE session keys (`baileys.session-*`,
 * `baileys.sender-key-*`) older than `maxAgeDays` (default 7 days).
 * `baileys.creds` and `baileys.meta` are NEVER touched — WhatsApp automatically
 * re-handshakes E2EE the next time a pruned user requests an OTP.
 */
export async function pruneStaleRecipientSessions(
  prisma: PrismaService,
  maxAgeDays = 7,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const res = await prisma.platformConfig.deleteMany({
    where: {
      OR: [
        { key: { startsWith: `${BAILEYS_KEY_PREFIX}session-` } },
        { key: { startsWith: `${BAILEYS_KEY_PREFIX}sender-key-` } },
      ],
      updatedAt: { lt: cutoff },
    },
  });
  return res.count;
}
