import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { COOKIE, readCookie } from './cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for the cookie-authenticated WEB client (double-submit token).
 *
 * Only state-changing requests are checked, and only when the request is driven by
 * the session COOKIE (cs_session present) rather than a Bearer token:
 *  - Native / server clients use `Authorization: Bearer` → exempt (not CSRF-able).
 *  - Auth routes (/api/v1/auth/*) establish/refresh/clear sessions → exempt.
 *  - Otherwise the X-CSRF-Token header must equal the (JS-readable) cs_csrf cookie.
 *    An attacker on another site can send the victim's cookies but cannot read the
 *    cs_csrf value to mirror it into the header, so forged requests are rejected.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();

    // Authentication endpoints (request OTP, verify, signup, refresh, logout) are exempt from CSRF.
    // Match the PATH only — never req.originalUrl, which carries the query string and could be
    // spoofed as `/api/v1/users/me?x=/auth/` to skip the check on a real mutating route.
    const path = (req.path || req.baseUrl || '').toLowerCase();
    if (path.startsWith('/api/v1/auth/') || path.startsWith('/auth/')) return next();

    const isBearer = req.headers.authorization?.startsWith('Bearer ') ?? false;
    const hasCookieSession = Boolean(readCookie(req, COOKIE.session));
    if (isBearer || !hasCookieSession) return next();

    const cookieToken = readCookie(req, COOKIE.csrf);
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || typeof headerToken !== 'string' || headerToken !== cookieToken) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }
    next();
  }
}
