import { describe, expect, it } from 'vitest';
import { VisitStatus } from '../generated/prisma/client.js';
import { canTransition } from './visits.module.js';

describe('Visit state machine (TRD §6.3)', () => {
  it('allows the documented happy path', () => {
    expect(canTransition(VisitStatus.REQUESTED, VisitStatus.CONFIRMED)).toBe(true);
    expect(canTransition(VisitStatus.CONFIRMED, VisitStatus.EN_ROUTE)).toBe(true);
    expect(canTransition(VisitStatus.EN_ROUTE, VisitStatus.CHECKED_IN)).toBe(true);
    expect(canTransition(VisitStatus.CHECKED_IN, VisitStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(VisitStatus.IN_PROGRESS, VisitStatus.CHECKED_OUT)).toBe(true);
    expect(canTransition(VisitStatus.CHECKED_OUT, VisitStatus.COMPLETED)).toBe(true);
  });

  it('allows cancelling request/confirmed visits but nothing after en-route', () => {
    expect(canTransition(VisitStatus.REQUESTED, VisitStatus.CANCELLED)).toBe(true);
    expect(canTransition(VisitStatus.CONFIRMED, VisitStatus.CANCELLED)).toBe(true);
    expect(canTransition(VisitStatus.EN_ROUTE, VisitStatus.CANCELLED)).toBe(false);
    expect(canTransition(VisitStatus.CHECKED_IN, VisitStatus.CANCELLED)).toBe(false);
  });

  it('rejects skipping states and reversing the flow', () => {
    expect(canTransition(VisitStatus.REQUESTED, VisitStatus.CHECKED_IN)).toBe(false);
    expect(canTransition(VisitStatus.CONFIRMED, VisitStatus.IN_PROGRESS)).toBe(false);
    expect(canTransition(VisitStatus.COMPLETED, VisitStatus.CHECKED_OUT)).toBe(false);
  });

  it('treats terminal states as terminal', () => {
    for (const terminal of [VisitStatus.COMPLETED, VisitStatus.DECLINED, VisitStatus.CANCELLED]) {
      expect(canTransition(terminal, VisitStatus.CONFIRMED)).toBe(false);
      expect(canTransition(terminal, VisitStatus.CANCELLED)).toBe(false);
    }
  });
});
