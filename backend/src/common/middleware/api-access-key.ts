import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

/**
 * Shared-secret gate for the public API. Every request must carry API_ACCESS_KEY
 * (x-api-key header, Basic Auth password, or a sign-in cookie) or gets a 401.
 * Keeps bots and crawlers from spending requests on a public host; it does NOT
 * replace user login. When the env var is unset the gate is off.
 */

export const API_ACCESS_KEY_MIN_LENGTH = 24;
export const ACCESS_COOKIE = 'cs_access';
const SIGN_IN_PATH = '/__access';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Paths callers cannot add a header to: Render's probe and signature-verified payment webhooks. */
function isExemptPath(path: string): boolean {
  return (
    path === '/health' || /^\/api\/v1\/payments\/webhook\/[^/]+\/?$/.test(path)
  );
}

const sha256 = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

/** Constant-time string comparison (hashing first equalises lengths). */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

/** Throws at startup when the key is set but too short to be a real secret. */
export function resolveApiAccessKey(raw: string | undefined): string | null {
  const key = raw?.trim();
  if (!key) return null;
  if (key.length < API_ACCESS_KEY_MIN_LENGTH) {
    throw new Error(
      `API_ACCESS_KEY must be at least ${API_ACCESS_KEY_MIN_LENGTH} characters`,
    );
  }
  return key;
}

function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === name)
      return part.slice(idx + 1).trim();
  }
  return undefined;
}

/** True when the header set carries the key (header, Basic password, or hashed cookie). */
function hasValidCredential(
  headers: IncomingMessage['headers'],
  key: string,
  query?: string | null,
): boolean {
  const header = headers['x-api-key'];
  if (typeof header === 'string' && safeEqual(header, key)) return true;
  if (query && safeEqual(query, key)) return true;

  const auth = headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const password = decoded.slice(decoded.indexOf(':') + 1);
    if (decoded.includes(':') && safeEqual(password, key)) return true;
  }

  const cookie = readCookie(headers.cookie, ACCESS_COOKIE);
  return cookie !== undefined && safeEqual(cookie, sha256(key).toString('hex'));
}

/** Only same-site paths: starts with "/" but not "//" or "/\" (open-redirect guard). */
export function safeRedirectTarget(target: unknown): string {
  if (
    typeof target === 'string' &&
    target.startsWith('/') &&
    !target.startsWith('//') &&
    !target.startsWith('/\\')
  ) {
    return target;
  }
  return '/';
}

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );

function signInPage(next: string, failed: boolean): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>CareSaath API - Private access</title><style>body{font-family:system-ui,sans-serif;background:#f5f7fa;display:grid;place-items:center;min-height:100vh;margin:0}form{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);width:min(92vw,360px)}h1{font-size:1.2rem;margin:0 0 .5rem}p{color:#555;font-size:.9rem}input,button{width:100%;box-sizing:border-box;padding:.7rem;margin-top:.75rem;border-radius:8px;font-size:1rem}input{border:1px solid #ccd}button{border:0;background:#0f766e;color:#fff;cursor:pointer}.err{color:#b91c1c}</style></head><body><form method="post" action="${SIGN_IN_PATH}"><h1>Private access</h1><p>Enter the access key to continue.</p>${failed ? '<p class="err">That key was not accepted.</p>' : ''}<input type="hidden" name="next" value="${escapeHtml(next)}"><input type="password" name="key" autocomplete="current-password" placeholder="Access key" required autofocus><button type="submit">Continue</button></form></body></html>`;
}

function sendSignIn(
  res: Response,
  next: string,
  failed: boolean,
  status: number,
): void {
  res
    .status(status)
    .setHeader(
      'Content-Security-Policy',
      "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'",
    )
    .type('html')
    .send(signInPage(next, failed));
}

/** Reads a tiny urlencoded form body (Nest's parsers are registered later, at listen time). */
function readForm(
  req: IncomingMessage,
): Promise<{ key?: string; next?: string }> {
  return new Promise((resolve) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
      if (raw.length > 4096) req.destroy();
    });
    req.on('end', () => {
      const params = new URLSearchParams(raw);
      resolve({
        key: params.get('key') ?? undefined,
        next: params.get('next') ?? undefined,
      });
    });
    req.on('error', () => resolve({}));
  });
}

export function apiAccessKeyMiddleware(rawKey: string | undefined) {
  const key = resolveApiAccessKey(rawKey);
  const cookieValue = key ? sha256(key).toString('hex') : '';

  const handleSignIn = (
    req: Request,
    res: Response,
    body: { key?: string; next?: string },
  ): void => {
    const target = safeRedirectTarget(body.next);
    if (typeof body.key === 'string' && safeEqual(body.key, key as string)) {
      const secure = req.secure ? '; Secure' : '';
      res.setHeader(
        'Set-Cookie',
        `${ACCESS_COOKIE}=${cookieValue}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`,
      );
      res.redirect(303, target);
      return;
    }
    sendSignIn(res, target, true, 401);
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!key || req.method === 'OPTIONS' || isExemptPath(req.path))
      return next();

    // Sign-in form submission: validate the key, set the cookie, redirect same-site.
    if (req.path === SIGN_IN_PATH && req.method === 'POST') {
      void readForm(req).then((body) => handleSignIn(req, res, body));
      return;
    }

    if (hasValidCredential(req.headers, key)) return next();

    if (
      req.method === 'GET' &&
      (req.headers.accept ?? '').includes('text/html')
    ) {
      sendSignIn(res, safeRedirectTarget(req.originalUrl), false, 401);
      return;
    }
    res
      .status(401)
      .json({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing or invalid API access key',
      });
  };
}

/** Socket.IO `allowRequest` check: Engine.IO runs before Express middleware. */
export function socketAccessCheck(rawKey: string | undefined) {
  const key = resolveApiAccessKey(rawKey);
  return (
    req: IncomingMessage,
    callback: (err: string | null | undefined, success: boolean) => void,
  ): void => {
    if (!key) return callback(null, true);
    const apiKey = new URL(req.url ?? '/', 'http://localhost').searchParams.get(
      'apiKey',
    );
    if (hasValidCredential(req.headers, key, apiKey))
      return callback(null, true);
    callback('Unauthorized', false);
  };
}
