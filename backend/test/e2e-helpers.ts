import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { RedisService } from '../src/common/redis/redis.module.js';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter.js';

/**
 * Boots the full application (real Postgres/Redis; Cloudinary storage falls back
 * to an in-memory driver when credentials are unset). E2E tests require the
 * Docker services to be running and the schema migrated.
 */
export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
  redis: RedisService;
  jwt: JwtService;
  close: () => Promise<void>;
}> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const prisma = app.get(PrismaService);
  const redis = app.get(RedisService);
  const jwt = app.get(JwtService);

  return {
    app,
    prisma,
    redis,
    jwt,
    close: async () => {
      await app.close();
    },
  };
}

/** Sign a valid access token for an existing user (bypasses the OTP flow). */
export function signAccessToken(
  jwt: JwtService,
  user: { id: string; role: string; phone: string },
): string {
  return jwt.sign(
    { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
    { secret: process.env['JWT_ACCESS_SECRET'], expiresIn: 900 },
  );
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Unique phone per test run to avoid collisions in the shared dev database. */
export function uniquePhone(prefix = '+923'): string {
  const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return `${prefix}${digits}`;
}

export async function flushOtpKeys(redis: RedisService): Promise<void> {
  const keys = await redis.client.keys('otp:*');
  if (keys.length > 0) {
    await redis.client.del(...keys);
  }
}
