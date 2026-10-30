import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  withScope: vi.fn(),
  captureException: vi.fn(),
  close: vi.fn().mockResolvedValue(true),
}));

vi.mock('@sentry/node', () => sentry);

import { captureServerException, closeSentry, initSentry } from './sentry.js';

const dsn = 'https://public@o1.ingest.sentry.io/1';

describe('observability/sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays disabled without a DSN', () => {
    expect(initSentry({})).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
    captureServerException(new Error('ignored'), { requestId: 'r-1' });
    expect(sentry.withScope).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('initialises once a DSN is configured and clamps the sample rate', () => {
    expect(
      initSentry({
        SENTRY_DSN: dsn,
        SENTRY_ENVIRONMENT: 'staging',
        SENTRY_RELEASE: 'abc123',
        SENTRY_TRACES_SAMPLE_RATE: '2',
      }),
    ).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn,
        environment: 'staging',
        release: 'abc123',
        tracesSampleRate: 1,
        dataCollection: expect.objectContaining({
          userInfo: false,
          cookies: false,
          httpBodies: [],
        }),
      }),
    );
  });

  it('strips request bodies, cookies and query strings before sending', () => {
    initSentry({ SENTRY_DSN: dsn });
    const options = sentry.init.mock.calls.at(-1)![0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    };
    const event = {
      request: {
        data: { phone: '+923001234567' },
        cookies: 'session=secret',
        query_string: 'phone=+923001234567',
        headers: { 'user-agent': 'test' },
      },
    };
    const result = options.beforeSend(event);
    expect(result).toBe(event);
    expect(event.request).toEqual({ headers: { 'user-agent': 'test' } });
  });

  it('reports the exception with correlation tags and no other PII', () => {
    initSentry({ SENTRY_DSN: dsn });
    const scope = { setTag: vi.fn(), setUser: vi.fn(), setLevel: vi.fn() };
    sentry.withScope.mockImplementation((callback: (s: typeof scope) => void) => callback(scope));
    const error = new Error('boom');

    captureServerException(error, {
      requestId: 'r-1',
      method: 'POST',
      path: '/api/v1/customer/bookings',
      userId: 'u-1',
      role: 'CUSTOMER',
    });

    expect(scope.setTag).toHaveBeenCalledWith('request_id', 'r-1');
    expect(scope.setTag).toHaveBeenCalledWith('http.method', 'POST');
    expect(scope.setTag).toHaveBeenCalledWith('user.role', 'CUSTOMER');
    expect(scope.setUser).toHaveBeenCalledWith({ id: 'u-1' });
    expect(scope.setLevel).toHaveBeenCalledWith('error');
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('never throws when the tracker itself fails', () => {
    initSentry({ SENTRY_DSN: dsn });
    sentry.withScope.mockImplementation(() => {
      throw new Error('sentry down');
    });
    expect(() => captureServerException(new Error('boom'))).not.toThrow();
  });

  it('closes the client on shutdown', async () => {
    initSentry({ SENTRY_DSN: dsn });
    await closeSentry(250);
    expect(sentry.close).toHaveBeenCalledWith(250);
  });
});
