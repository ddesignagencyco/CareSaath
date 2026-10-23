import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { RedisService } from '../src/common/redis/redis.module.js';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter.js';

/**
 * A valid 1x1 PNG. The storage service accepts the MIME type, and a real
 * Cloudinary account rejects truncated images, so the fixtures have to be
 * genuine files rather than magic-byte stubs.
 */
export const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** A minimal but structurally valid PDF document. */
export const VALID_PDF = Buffer.from(
  [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF',
  ].join('\n'),
  'utf8',
);

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
  // E2E tests are hermetic by default: with the credentials unset the
  // storage service falls back to its in-memory driver, so uploads need
  // neither a Cloudinary account nor network access. Set
  // E2E_USE_CLOUDINARY=true to exercise the real upload path instead.
  if (process.env['E2E_USE_CLOUDINARY'] !== 'true') {
    process.env['CLOUDINARY_CLOUD_NAME'] = '';
    process.env['CLOUDINARY_API_KEY'] = '';
    process.env['CLOUDINARY_API_SECRET'] = '';
  }

  // Likewise Stripe: card payments use the generic gateway flow unless E2E_USE_STRIPE=true.
  if (process.env['E2E_USE_STRIPE'] !== 'true') {
    process.env['STRIPE_SECRET_KEY'] = '';
    process.env['STRIPE_WEBHOOK_SECRET'] = '';
  }

  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>({ rawBody: true });
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
