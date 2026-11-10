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
  // Mirrors the CareSaath API status page (app.controller.ts): navy gradient, Inter, glass cards.
  const css = `
:root{--bg:radial-gradient(1200px 800px at 50% 0%,#1a2142 0%,#0b1026 55%,#070b1a 100%);--border:rgba(138,180,255,.25);--text:#f8fafc;--text2:#cbd5f5;--text3:#94a3b8;--accent:#22c55e;--link:#8ab4ff}
*{margin:0;padding:0;box-sizing:border-box;font-family:"Inter",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
body{background:var(--bg);color:var(--text);line-height:1.6;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden}
body::before,body::after{content:"";position:absolute;width:420px;height:420px;border-radius:50%;filter:blur(140px);opacity:.4;pointer-events:none}
body::before{top:-160px;left:-160px;background:radial-gradient(circle,rgba(138,180,255,.28),transparent)}
body::after{bottom:-220px;right:-180px;background:radial-gradient(circle,rgba(34,197,94,.18),transparent)}
main{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:24px;text-align:center;width:min(680px,100%)}
.badge{display:inline-flex;align-items:center;gap:10px;padding:8px 18px;border-radius:999px;border:1px solid rgba(34,197,94,.45);background:radial-gradient(circle,rgba(34,197,94,.18) 0%,transparent 70%);text-transform:uppercase;letter-spacing:.28em;font-size:11px;font-weight:600;color:var(--text2)}
.pulse{width:9px;height:9px;border-radius:50%;background:var(--accent);animation:pulse 2.6s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.4)}70%{box-shadow:0 0 0 10px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
h1{font-size:clamp(2.8rem,6vw,4.5rem);font-weight:700;letter-spacing:-.08em;line-height:1.1}
.sub{margin:12px auto 0;max-width:540px;color:var(--text3);font-size:1.05rem}
.card{position:relative;width:min(640px,100%);border-radius:18px;border:1px solid var(--border);background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.015));backdrop-filter:blur(18px);box-shadow:0 60px 120px -80px rgba(138,180,255,.45);overflow:hidden;text-align:left}
.card::before{content:"";position:absolute;inset:0;background:radial-gradient(600px 200px at 50% 0%,rgba(138,180,255,.12),transparent);pointer-events:none}
.sec{position:relative;padding:clamp(20px,4vw,28px)}.sec+.sec{border-top:1px solid rgba(138,180,255,.15)}
.eyebrow{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--text3);font-weight:600;margin-bottom:14px}
.row{display:flex;gap:14px;align-items:flex-start}.row+.row{margin-top:16px}
.icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;border:1px solid rgba(138,180,255,.4);background:radial-gradient(circle,rgba(138,180,255,.18),transparent);color:var(--link)}
.row b{display:block;font-weight:600}.row span{color:var(--text3);font-size:.95rem}
label{display:block;font-weight:600;margin-bottom:8px}
input{width:100%;height:54px;border-radius:12px;border:1px solid var(--border);background:rgba(7,11,26,.6);color:var(--text);font-size:1rem;padding:0 16px}
input:focus{outline:2px solid var(--link);outline-offset:1px}
button{width:100%;margin-top:14px;height:54px;border:1px solid rgba(138,180,255,.5);border-radius:12px;background:radial-gradient(circle,rgba(138,180,255,.28),rgba(138,180,255,.12));color:var(--text);font-size:1rem;font-weight:600;cursor:pointer;transition:all 180ms ease}
button:hover{border-color:var(--link);background:radial-gradient(circle,rgba(138,180,255,.4),rgba(138,180,255,.18))}
.err{margin-bottom:14px;padding:12px 14px;border-radius:12px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#fecaca;font-size:.95rem}
footer{position:relative;z-index:1;margin-top:28px;text-align:center;color:var(--text3);font-size:.95rem}
`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>CareSaath API | Private access</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"><style>${css}</style></head><body><main><div class="badge"><span class="pulse"></span><span>Private access</span></div><div><h1>CareSaath API</h1><p class="sub">Secure backend powering the CareSaath home nursing &amp; physiotherapy marketplace. This server is open to authorised users and the CareSaath apps only.</p></div><div class="card"><div class="sec"><p class="eyebrow">Who needs this</p><div class="row"><div class="icon"><i class="bi bi-code-slash"></i></div><div><b>Developers &amp; CareSaath tech staff</b><span>Swagger API reference, service health, and integration access for bookings, caregivers, visits, payments and notifications.</span></div></div><div class="row"><div class="icon"><i class="bi bi-heart-pulse"></i></div><div><b>Patients, families &amp; caregivers</b><span>You do not need this page. Use the CareSaath website or app; it connects to this server for you.</span></div></div></div><form class="sec" method="post" action="${SIGN_IN_PATH}"><p class="eyebrow">Enter the access key</p>${failed ? '<p class="err" role="alert">That key was not accepted. Please try again.</p>' : ''}<input type="hidden" name="next" value="${escapeHtml(next)}"><label for="key">Access key</label><input id="key" type="password" name="key" autocomplete="current-password" required autofocus><button type="submit">Continue</button></form></div></main><footer>CareSaath &bull; Backend Infrastructure<br>Don't have a key? Contact the CareSaath team.</footer></body></html>`;
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
      "default-src 'none'; form-action 'self'; base-uri 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src https://fonts.gstatic.com https://cdn.jsdelivr.net",
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
