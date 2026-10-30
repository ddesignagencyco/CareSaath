import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Minimal structured request log with a correlation id. Every response carries
 * `X-Request-Id`, and errors include it via AllExceptionsFilter, which makes a
 * user-reported failure traceable through Render's log drain.
 *
 * Paths only (never query strings or bodies) are logged so phone numbers and
 * medical data do not leak into logs.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId =
      (Array.isArray(incoming) ? incoming[0] : incoming)?.slice(0, 128) || randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();
    const path = req.path ?? req.url ?? '/';
    const shouldLog = !path.startsWith('/health') && !path.startsWith('/docs');

    res.on('finish', () => {
      if (!shouldLog) return;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const line = `${req.method} ${path} ${res.statusCode} ${durationMs.toFixed(1)}ms ip=${req.ip ?? '-'} requestId=${requestId}`;
      if (res.statusCode >= 500) {
        this.logger.error(line);
      } else if (res.statusCode >= 400) {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });

    next();
  }
}
