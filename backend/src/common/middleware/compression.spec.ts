import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { compressionMiddleware, selectEncoding } from './compression.js';

describe('selectEncoding', () => {
  it('returns null when the client accepts no compressed encoding', () => {
    expect(selectEncoding(undefined)).toBeNull();
    expect(selectEncoding('')).toBeNull();
    expect(selectEncoding('identity')).toBeNull();
    expect(selectEncoding('gzip;q=0')).toBeNull();
    expect(selectEncoding('br;q=0, gzip;q=0')).toBeNull();
  });

  it('picks gzip when it is the only option', () => {
    expect(selectEncoding('gzip')).toBe('gzip');
    expect(selectEncoding('gzip, deflate, br;q=0')).toBe('gzip');
  });

  it('prefers brotli over gzip', () => {
    expect(selectEncoding('br')).toBe('br');
    expect(selectEncoding('gzip, br')).toBe('br');
    expect(selectEncoding('gzip;q=1.0, br;q=0.9')).toBe('gzip');
    expect(selectEncoding('gzip;q=0.5, br;q=0.9')).toBe('br');
  });
});

/** Minimal Express response double that records what the middleware wrote. */
function createResponse(): Response & {
  written: Buffer[];
  headers: Record<string, string>;
} {
  const res = {
    written: [] as Buffer[],
    headers: {} as Record<string, string>,
    statusCode: 200,
    write(chunk: unknown): boolean {
      res.written.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    },
    end(chunk?: unknown): Response {
      if (chunk !== undefined && chunk !== null) {
        res.write(chunk);
      }
      return res as unknown as Response;
    },
    setHeader(name: string, value: string | number | readonly string[]): void {
      res.headers[name.toLowerCase()] = String(value);
    },
    getHeader(name: string): string | undefined {
      return res.headers[name.toLowerCase()];
    },
    removeHeader(name: string): void {
      delete res.headers[name.toLowerCase()];
    },
  };
  return res as unknown as Response & { written: Buffer[]; headers: Record<string, string> };
}

function runMiddleware(
  acceptEncoding: string | undefined,
  body: string,
): { res: ReturnType<typeof createResponse>; next: NextFunction } {
  const res = createResponse();
  const next = vi.fn() as unknown as NextFunction;
  const req = {
    headers: acceptEncoding === undefined ? {} : { 'accept-encoding': acceptEncoding },
  } as unknown as Request;

  compressionMiddleware()(req, res, next);
  expect(next).toHaveBeenCalled();

  res.setHeader('content-length', String(Buffer.byteLength(body)));
  res.write(body);
  res.end();
  return { res, next };
}

describe('compressionMiddleware', () => {
  const body = JSON.stringify({
    items: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `Caregiver ${i}` })),
  });

  it('compresses a large payload with gzip and clears the stale headers', () => {
    const { res } = runMiddleware('gzip', body);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['content-length']).toBeUndefined();
    expect(res.headers['etag']).toBeUndefined();
    expect(res.headers['vary']).toContain('accept-encoding');
    expect(gunzipSync(Buffer.concat(res.written)).toString('utf8')).toBe(body);
  });

  it('compresses a large payload with brotli', () => {
    const { res } = runMiddleware('br', body);
    expect(res.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(Buffer.concat(res.written)).toString('utf8')).toBe(body);
  });

  it('leaves the payload untouched when the client accepts no encoding', () => {
    const { res } = runMiddleware(undefined, body);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(Buffer.concat(res.written).toString('utf8')).toBe(body);
    // The response still varies by encoding for shared caches.
    expect(res.headers['vary']).toContain('accept-encoding');
  });

  it('does not compress a payload that is too small to be worth it', () => {
    const { res } = runMiddleware('gzip', '{"ok":true}');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(Buffer.concat(res.written).toString('utf8')).toBe('{"ok":true}');
  });
});
