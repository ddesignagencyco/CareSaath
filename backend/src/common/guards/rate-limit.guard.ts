import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedisService } from '../redis/redis.module.js';

/**
 * Coarse per-IP rate limit backed by Redis. This complements the tighter
 * per-phone OTP limits in AuthService: without it, an attacker can rotate
 * phone numbers and hammer login, search, uploads or webhooks.
 *
 * Enabled by default only in production (so local dev and e2e runs are not
 * throttled); set RATE_LIMIT_ENABLED=true/false to override.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly enabled =
    process.env['RATE_LIMIT_ENABLED'] === 'true' ||
    (process.env['RATE_LIMIT_ENABLED'] !== 'false' &&
      process.env['NODE_ENV'] === 'production');
  private readonly max = Number(process.env['RATE_LIMIT_MAX'] ?? 300);
  private readonly windowSeconds = Number(process.env['RATE_LIMIT_WINDOW_SECONDS'] ?? 60);

  /** Health probes, docs and gateway webhooks should not consume the shared IP budget. */
  private static readonly SKIP_PATHS = [
    '/health',
    '/health/ready',
    '/docs',
    '/docs-json',
    '/api/v1/payments/webhook',
  ];

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled || context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    if (request.method === 'OPTIONS') {
      return true;
    }

    const path = request.path ?? request.url ?? '/';
    if (RateLimitGuard.SKIP_PATHS.some((skip) => path === skip || path.startsWith(`${skip}/`))) {
      return true;
    }

    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const window = Math.floor(Date.now() / (this.windowSeconds * 1000));
    const key = `ratelimit:${ip}:${window}`;

    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) {
        await this.redis.client.expire(key, this.windowSeconds);
      }

      const remaining = Math.max(0, this.max - count);
      response.setHeader('X-RateLimit-Limit', String(this.max));
      response.setHeader('X-RateLimit-Remaining', String(remaining));
      response.setHeader('X-RateLimit-Reset', String((window + 1) * this.windowSeconds));

      if (count > this.max) {
        response.setHeader('Retry-After', String(this.windowSeconds));
        throw new HttpException(
          'Too many requests, please try again later',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      // Fail open: a Redis outage must not take the whole API down.
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.warn(`Rate limiter unavailable, allowing request: ${(error as Error).message}`);
    }

    return true;
  }
}
