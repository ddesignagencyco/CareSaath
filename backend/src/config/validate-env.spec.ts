import { describe, expect, it } from 'vitest';
import { validateEnv } from './validate-env.js';

const strong = 'a'.repeat(40);

function productionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@db:5432/caresaath',
    REDIS_URL: 'redis://redis:6379',
    JWT_ACCESS_SECRET: strong,
    JWT_REFRESH_SECRET: strong,
    PAYOUT_ENCRYPTION_KEY: strong,
    CNIC_ENCRYPTION_KEY: strong,
    MEDICAL_ENCRYPTION_KEY: strong,
    PAYMENT_WEBHOOK_SECRET: strong,
    SMS_API_URL: 'https://sms.example/send',
    SMS_API_KEY: 'key',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('validateEnv', () => {
  it('accepts a complete production configuration', () => {
    expect(() => validateEnv({ env: productionEnv() })).not.toThrow();
  });

  it('rejects a missing encryption key in production', () => {
    expect(() =>
      validateEnv({ env: productionEnv({ CNIC_ENCRYPTION_KEY: undefined }) }),
    ).toThrow(/CNIC_ENCRYPTION_KEY is required/);
  });

  it('rejects a placeholder secret in production', () => {
    expect(() =>
      validateEnv({ env: productionEnv({ JWT_ACCESS_SECRET: 'change-me' }) }),
    ).toThrow(/placeholder/);
  });

  it('rejects a short secret in production', () => {
    expect(() =>
      validateEnv({ env: productionEnv({ JWT_ACCESS_SECRET: 'short' }) }),
    ).toThrow(/at least 32 characters/);
  });

  it('rejects production without an SMS provider unless dev logging is explicit', () => {
    expect(() =>
      validateEnv({ env: productionEnv({ SMS_API_URL: undefined, SMS_API_KEY: undefined }) }),
    ).toThrow(/SMS_API_URL/);

    expect(() =>
      validateEnv({
        env: productionEnv({ SMS_API_URL: undefined, SMS_API_KEY: undefined, SMS_DEV_LOG: 'true' }),
      }),
    ).not.toThrow();
  });

  it('allows placeholders outside production', () => {
    expect(() =>
      validateEnv({
        env: {
          NODE_ENV: 'development',
          DATABASE_URL: 'postgresql://localhost/caresaath',
          REDIS_URL: 'redis://localhost:6379',
          JWT_ACCESS_SECRET: 'change-me',
          JWT_REFRESH_SECRET: 'change-me',
        } as NodeJS.ProcessEnv,
      }),
    ).not.toThrow();
  });
});
