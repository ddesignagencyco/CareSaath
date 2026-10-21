import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { NextFunction, Request, Response } from 'express';

/**
 * Response compression for the public API (SRS §6 / TRD §8: "compressed
 * payloads (gzip/brotli)" is one of the mitigations listed for the "search
 * under 3 s on 3G" requirement).
 *
 * A caregiver search page can carry up to 100 profiles with 2000-character
 * bios, which is a couple of hundred kilobytes of JSON. On a 3G link that
 * alone blows the 3 s budget, so the payload is compressed before it leaves
 * the process.
 *
 * The middleware buffers the response, compresses it once it is complete and
 * then writes it out. The API only sends JSON payloads (documents are served
 * from Cloudinary with signed URLs), so there is no streaming to preserve.
 */

/** Payloads below this size are not worth compressing. */
const MIN_COMPRESSIBLE_BYTES = 1024;

/** Brotli quality 5: a good size/CPU trade-off for JSON responses. */
const BROTLI_QUALITY = 5;
/** Deflate level 6 is the default gzip level and a sensible CPU trade-off. */
const GZIP_LEVEL = 6;

type Encoding = 'br' | 'gzip';

/** Parses an Accept-Encoding header into its q-values. */
function parseAcceptEncoding(header: string | undefined): Map<string, number> {
  const weights = new Map<string, number>();
  if (!header) {
    return weights;
  }
  for (const part of header.split(',')) {
    const [rawName, ...params] = part.trim().split(';');
    const name = rawName.trim().toLowerCase();
    if (!name) {
      continue;
    }
    let quality = 1;
    for (const param of params) {
      const [key, value] = param.split('=').map((part) => part.trim().toLowerCase());
      if (key === 'q') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          quality = parsed;
        }
      }
    }
    weights.set(name, quality);
  }
  return weights;
}

/** Picks the best encoding the client accepts, preferring Brotli. */
export function selectEncoding(acceptEncoding: string | undefined): Encoding | null {
  const weights = parseAcceptEncoding(acceptEncoding);
  const br = weights.get('br') ?? 0;
  const gzip = weights.get('gzip') ?? 0;
  if (br > 0 && br >= gzip) {
    return 'br';
  }
  if (gzip > 0) {
    return 'gzip';
  }
  return null;
}

function toBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (typeof chunk === 'string') {
    return Buffer.from(chunk, 'utf8');
  }
  return Buffer.from(String(chunk), 'utf8');
}

/**
 * Adds a field to the `Vary` header without dropping the existing ones, so a
 * shared cache never serves a compressed body to a client that cannot decode
 * it (or the other way round).
 */
function appendVary(res: Response, field: string): void {
  const existing = res.getHeader('vary');
  const values = Array.isArray(existing)
    ? existing.flatMap((value) => String(value).split(','))
    : String(existing ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
  if (values.some((value) => value.toLowerCase() === field)) {
    return;
  }
  res.setHeader('vary', [...values, field].join(', '));
}

/**
 * Express/Nest middleware that compresses outgoing payloads when the client
 * advertises support for gzip or Brotli.
 */
export function compressionMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const encoding = selectEncoding(req.headers['accept-encoding']);
    // The response varies by encoding whether or not this particular body
    // ends up compressed.
    appendVary(res, 'accept-encoding');
    if (!encoding) {
      next();
      return;
    }

    const chunks: Buffer[] = [];
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    let finished = false;

    res.write = ((chunk: unknown): boolean => {
      chunks.push(toBuffer(chunk));
      return true;
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...rest: unknown[]): Response => {
      if (finished) {
        return res;
      }
      finished = true;
      res.write = originalWrite;
      res.end = originalEnd;

      if (chunk !== undefined && chunk !== null) {
        chunks.push(toBuffer(chunk));
      }
      const body = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);

      if (body.length < MIN_COMPRESSIBLE_BYTES) {
        // The body was captured through the overridden `write`, so it has to
        // be flushed explicitly before the response is closed.
        if (body.length > 0) {
          originalWrite(body);
        }
        const callback = rest.find((arg) => typeof arg === 'function');
        return (originalEnd as (...args: unknown[]) => Response)(
          ...(callback ? [callback] : []),
        );
      }

      const compressed =
        encoding === 'br'
          ? brotliCompressSync(body, {
              params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
            })
          : gzipSync(body, { level: GZIP_LEVEL });

      res.setHeader('content-encoding', encoding);
      // The compressed body has a different length than the payload the
      // framework measured, and the validator no longer matches the bytes on
      // the wire.
      res.removeHeader('content-length');
      res.removeHeader('etag');
      originalEnd(compressed);
      return res;
    }) as typeof res.end;

    next();
  };
}
