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
 *  - Pre-session requests (login, OTP) have no cs_session cookie yet → exempt.
 *  - Otherwise the X-CSRF-Token header must equal the (JS-readable) cs_csrf cookie.
 *    An attacker on another site can send the victim's cookies but cannot read the
 *    cs_csrf value to mirror it into the header, so forged requests are rejected.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();
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
