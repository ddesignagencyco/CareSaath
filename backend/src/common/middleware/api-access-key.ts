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
  const css =
    ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:#171f1d;color:#eef3f1;font-family:Ubuntu,system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '.card{width:min(100%,650px);background:#1c2926;border:1px solid #2c3d39;border-radius:20px;padding:36px}' +
    'h1{margin:0 0 12px;font-size:2rem}.lead{margin:0 0 28px;color:#9db0aa;font-size:1.1rem;line-height:1.6}' +
    'h2{margin:0 0 12px;font-size:.85rem;letter-spacing:.08em;text-transform:uppercase;color:#9db0aa}' +
    '.box{border:1px solid #2c3d39;border-radius:14px;padding:14px 16px;margin-bottom:12px;line-height:1.5}.box b{display:block}' +
    'label{display:block;font-weight:700;margin:24px 0 10px}input{width:100%;height:62px;border-radius:14px;border:1px solid #2c3d39;background:#1a2523;color:inherit;font-size:1rem;padding:0 16px}input:focus{outline:2px solid #4fb69b}' +
    'button{width:100%;margin-top:14px;height:60px;border:0;border-radius:14px;background:#4fb69b;color:#fff;font-size:1.1rem;font-weight:700;cursor:pointer}button:hover{background:#45a48b}' +
    '.err{margin:16px 0 0;padding:12px 14px;border-radius:12px;background:#3a1f21;color:#ffb4b4}.foot{margin:18px 0 0;color:#9db0aa;font-size:.9rem}';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>CareSaath API - Private access</title><style>${css}</style></head><body><main class="card"><h1>CareSaath API</h1><p class="lead">Private access. This server powers the CareSaath home nursing and physiotherapy platform and is open to authorised users and the CareSaath apps only.</p><h2>Who needs this</h2><div class="box"><b>Developers &amp; CareSaath tech staff</b>API documentation (Swagger), service status and integration access for bookings, caregivers, visits, payments and notifications.</div><div class="box"><b>Patients, families &amp; caregivers</b>You do not need this page. Use the CareSaath website or app; it connects to this server for you.</div><form method="post" action="${SIGN_IN_PATH}"><h2 style="margin-top:28px">Enter the access key</h2><input type="hidden" name="next" value="${escapeHtml(next)}"><label for="key">Access key</label><input id="key" type="password" name="key" autocomplete="current-password" required autofocus>${failed ? '<p class="err" role="alert">That key was not accepted. Please try again.</p>' : ''}<button type="submit">Continue</button></form><p class="foot">Don't have a key? Contact the CareSaath team.</p></main></body></html>`;
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
    res.status(401).json({
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
