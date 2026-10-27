import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VisitStatus } from '../generated/prisma/client.js';
import { NOTIFICATION_EVENTS } from './events.js';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('notification catalogue', () => {
  it('declares every event string used in source, so none can be silently dropped', () => {
    const used = new Set<string>();
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/event:\s*'([a-z_]+(?:\.[a-z_]+)+)'/g)) {
        used.add(match[1]!);
      }
      // helpers such as notifyCaregiver(id, 'caregiver.verification.x', ...)
      for (const match of text.matchAll(/notifyCaregiver\([^,]+,\s*'([a-z_.]+)'/g)) {
        used.add(match[1]!);
      }
    }
    const missing = [...used].filter((event) => !(event in NOTIFICATION_EVENTS));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(15);
  });

  it('covers every visit status that notifies the customer', () => {
    for (const status of Object.values(VisitStatus)) {
      if (status === VisitStatus.REQUESTED) continue;
      expect(NOTIFICATION_EVENTS[`visit.${status.toLowerCase()}`]?.audience).toEqual(['CUSTOMER']);
    }
  });

  it('gives every event at least one audience and a title', () => {
    for (const [event, def] of Object.entries(NOTIFICATION_EVENTS)) {
      expect(def.audience.length, event).toBeGreaterThan(0);
      expect(def.title.length, event).toBeGreaterThan(0);
    }
  });

  it('keeps admin-only and caregiver-only events away from the other roles', () => {
    expect(NOTIFICATION_EVENTS['payout.requested']!.audience).toEqual(['ADMIN']);
    expect(NOTIFICATION_EVENTS['booking.requested']!.audience).toEqual(['CAREGIVER']);
    expect(NOTIFICATION_EVENTS['payout.transferred']!.audience).toEqual(['CAREGIVER']);
  });
});
