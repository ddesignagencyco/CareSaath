import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * httpOnly-cookie session for the WEB client (XSS-safe: JS cannot read the tokens).
 * The native app is unaffected — it still receives the tokens in the response body
 * and sends them as `Authorization: Bearer`. The guard accepts either.
 *
 * Cookie set:
 *  - cs_access   httpOnly  — the access JWT (sent to every API route)
 *  - cs_refresh  httpOnly  — the refresh JWT, path-scoped to /api/v1/auth only
 *  - cs_session  readable  — "1" flag so the SPA knows it is logged in (no secret)
 *  - cs_csrf     readable  — double-submit CSRF token the SPA echoes in X-CSRF-Token
 */
export const COOKIE = {
  access: 'cs_access',
  refresh: 'cs_refresh',
  session: 'cs_session',
  csrf: 'cs_csrf',
} as const;

/** Refresh cookie is scoped to the auth routes so it is never sent to ordinary endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const isProd = process.env['NODE_ENV'] === 'production';
const ACCESS_TTL_MS = Number(process.env['JWT_ACCESS_TTL_SECONDS'] ?? 900) * 1000;
const REFRESH_TTL_MS = Number(process.env['JWT_REFRESH_TTL_SECONDS'] ?? 604800) * 1000;

// Cross-site in production (Vercel front-end ↔ Render API) needs SameSite=None;Secure;
// locally the SPA and API share the localhost site, so Lax works over plain http.
const sameSite: 'none' | 'lax' = isProd ? 'none' : 'lax';
const secure = isProd;

export function makeCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Read the role claim from our own access JWT (no verification; we just signed it). */
export function roleFromAccessToken(accessToken: string): string {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')) as { role?: string };
    return payload.role ?? '';
  } catch {
    return '';
  }
}

export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }, csrf: string, role: string): void {
  res.cookie(COOKIE.access, tokens.accessToken, { httpOnly: true, secure, sameSite, path: '/', maxAge: ACCESS_TTL_MS });
  res.cookie(COOKIE.refresh, tokens.refreshToken, { httpOnly: true, secure, sameSite, path: REFRESH_COOKIE_PATH, maxAge: REFRESH_TTL_MS });
  // Readable by JS (no secret): the signed-in role, used by the SPA for routing
  // and section guards. Also serves as the "is signed in" flag.
  res.cookie(COOKIE.session, role || '1', { httpOnly: false, secure, sameSite, path: '/', maxAge: REFRESH_TTL_MS });
  res.cookie(COOKIE.csrf, csrf, { httpOnly: false, secure, sameSite, path: '/', maxAge: REFRESH_TTL_MS });
}

/** (Re)issue only the readable CSRF cookie — used by GET /auth/session when one is missing. */
export function setCsrfCookie(res: Response, csrf: string): void {
  res.cookie(COOKIE.csrf, csrf, { httpOnly: false, secure, sameSite, path: '/', maxAge: REFRESH_TTL_MS });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(COOKIE.access, { httpOnly: true, secure, sameSite, path: '/' });
  res.clearCookie(COOKIE.refresh, { httpOnly: true, secure, sameSite, path: REFRESH_COOKIE_PATH });
  res.clearCookie(COOKIE.session, { httpOnly: false, secure, sameSite, path: '/' });
  res.clearCookie(COOKIE.csrf, { httpOnly: false, secure, sameSite, path: '/' });
}

/** Read one cookie from the raw Cookie header (no cookie-parser dependency needed). */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
