import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for sensitive columns (ERD §3.5, TRD §9): CNIC,
 * patient medical context and payout account numbers are stored encrypted at
 * rest. Key management is TBD, so a single env key drives AES-256-GCM. Values
 * are stored as `iv:tag:ciphertext` (base64) so they are self-describing.
 */
export function deriveKey(envVar: string, fallback: string): Buffer {
  return createHash('sha256').update(process.env[envVar] ?? fallback).digest();
}

export function encryptField(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptField(stored: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted value');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** True when a stored value looks like ciphertext produced by encryptField. */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Transparently decrypt a field that may have been written before encryption
 * was introduced (legacy plaintext rows). Returns the plaintext either way.
 */
export function decryptMaybe(stored: string | null | undefined, key: Buffer): string | null {
  if (stored === null || stored === undefined) return null;
  if (!isEncrypted(stored)) return stored;
  try {
    return decryptField(stored, key);
  } catch {
    return stored;
  }
}

/** Keep the last `visible` characters, mask the rest (e.g. CNIC/account no.). */
export function maskValue(value: string, visible = 4): string {
  const tail = value.slice(-visible);
  return `${'*'.repeat(Math.max(0, value.length - visible))}${tail}`;
}
