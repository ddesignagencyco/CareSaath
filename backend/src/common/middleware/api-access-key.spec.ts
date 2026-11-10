import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  ACCESS_COOKIE,
  apiAccessKeyMiddleware,
  resolveApiAccessKey,
  safeRedirectTarget,
  socketAccessCheck,
} from './api-access-key.js';

const KEY = 'k'.repeat(32);

function run(
  req: { method?: string; path?: string; headers?: Record<string, string> },
  key: string | undefined = KEY,
) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    type() {
      return this;
    },
    send(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
  };
  const next = vi.fn();
  apiAccessKeyMiddleware(key)(
    {
      method: 'GET',
      path: '/api/v1/users/me',
      originalUrl: '/api/v1/users/me',
      headers: {},
      ...req,
    } as unknown as Request,
    res as unknown as Response,
    next as NextFunction,
  );
  return { res, next };
}

describe('apiAccessKeyMiddleware', () => {
  it('is off when the key is unset', () => {
    expect(run({}, '').next).toHaveBeenCalled();
  });
  it('rejects a request with no key (401 JSON)', () => {
    const { res, next } = run({});
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
  it('rejects a wrong key', () => {
    expect(run({ headers: { 'x-api-key': 'wrong' } }).res.statusCode).toBe(401);
  });
  it('accepts the right x-api-key', () => {
    expect(run({ headers: { 'x-api-key': KEY } }).next).toHaveBeenCalled();
  });
  it('accepts Basic Auth with the key as password', () => {
    const auth = 'Basic ' + Buffer.from(`any:${KEY}`).toString('base64');
    expect(run({ headers: { authorization: auth } }).next).toHaveBeenCalled();
  });
  it('accepts the hashed cookie but not the raw key in a cookie', () => {
    const hash = createHash('sha256').update(KEY).digest('hex');
    expect(
      run({ headers: { cookie: `${ACCESS_COOKIE}=${hash}` } }).next,
    ).toHaveBeenCalled();
    expect(
      run({ headers: { cookie: `${ACCESS_COOKIE}=${KEY}` } }).res.statusCode,
    ).toBe(401);
  });
  it('exempts /health, payment webhooks and OPTIONS preflight', () => {
    expect(run({ path: '/health' }).next).toHaveBeenCalled();
    expect(
      run({ method: 'POST', path: '/api/v1/payments/webhook/stripe' }).next,
    ).toHaveBeenCalled();
    expect(run({ method: 'OPTIONS' }).next).toHaveBeenCalled();
  });
  it('serves the sign-in page to browser GETs with a scoped CSP', () => {
    const { res } = run({ headers: { accept: 'text/html,*/*' } });
    expect(res.statusCode).toBe(401);
    expect(String(res.body)).toContain('<form');
    expect(res.headers['Content-Security-Policy']).toContain(
      "form-action 'self'",
    );
  });
});

describe('resolveApiAccessKey / safeRedirectTarget', () => {
  it('rejects keys shorter than 24 chars, treats blank as unset', () => {
    expect(() => resolveApiAccessKey('short')).toThrow();
    expect(resolveApiAccessKey('  ')).toBeNull();
  });
  it('only follows same-site paths', () => {
    expect(safeRedirectTarget('/docs')).toBe('/docs');
    expect(safeRedirectTarget('//evil.com')).toBe('/');
    expect(safeRedirectTarget('https://evil.com')).toBe('/');
    expect(safeRedirectTarget('/\\evil.com')).toBe('/');
  });
});

describe('socketAccessCheck', () => {
  const check = (url: string, headers = {}) => {
    const cb = vi.fn();
    socketAccessCheck(KEY)({ url, headers } as never, cb);
    return cb.mock.calls[0]?.[1];
  };
  it('accepts apiKey query or header, rejects otherwise', () => {
    expect(check(`/socket.io/?apiKey=${KEY}`)).toBe(true);
    expect(check('/socket.io/', { 'x-api-key': KEY })).toBe(true);
    expect(check('/socket.io/?apiKey=nope')).toBe(false);
    expect(check('/socket.io/')).toBe(false);
  });
});
