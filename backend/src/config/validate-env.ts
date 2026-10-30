/**
 * Fail-fast environment validation. Imported and executed at the top of
 * `main.ts` so a production process never starts with missing or placeholder
 * secrets (in particular the field-encryption keys, which have public dev
 * fallbacks in `field-encryption.ts`).
 *
 * Local development and tests stay permissive; production is strict.
 */

const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'changeme',
  'secret',
  'caresaath-dev-cnic-key',
  'caresaath-dev-medical-key',
  'caresaath-dev-payout-key',
]);

const MIN_SECRET_LENGTH = 32;

export interface EnvValidationOptions {
  env?: NodeJS.ProcessEnv;
  /** Treat the process as production even when NODE_ENV is unset (used by tests). */
  production?: boolean;
}

export function validateEnv(options: EnvValidationOptions = {}): void {
  const env = options.env ?? process.env;
  const isProduction = options.production ?? env['NODE_ENV'] === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  if (isProduction) {
    required.push(
      'PAYOUT_ENCRYPTION_KEY',
      'CNIC_ENCRYPTION_KEY',
      'MEDICAL_ENCRYPTION_KEY',
      'PAYMENT_WEBHOOK_SECRET',
    );
  }

  for (const key of required) {
    const value = env[key];
    if (!value || value.trim() === '') {
      errors.push(`${key} is required`);
    }
  }

  const secretKeys = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'PAYOUT_ENCRYPTION_KEY',
    'CNIC_ENCRYPTION_KEY',
    'MEDICAL_ENCRYPTION_KEY',
    'PAYMENT_WEBHOOK_SECRET',
  ];

  for (const key of secretKeys) {
    const value = env[key];
    if (!value) continue;
    if (PLACEHOLDER_SECRETS.has(value.trim().toLowerCase())) {
      if (isProduction) {
        errors.push(`${key} is still set to a placeholder value`);
      } else {
        warnings.push(`${key} is a placeholder; fine locally, never in production`);
      }
    } else if (isProduction && value.length < MIN_SECRET_LENGTH) {
      errors.push(`${key} must be at least ${MIN_SECRET_LENGTH} characters in production`);
    }
  }

  if (isProduction) {
    // OTPs must never be silently written to production logs. A real provider
    // is required unless the operator explicitly opts into dev logging.
    if (!env['SMS_API_URL'] && env['SMS_DEV_LOG'] !== 'true') {
      errors.push(
        'SMS_API_URL (and SMS_API_KEY) must be set in production, or SMS_DEV_LOG=true to opt into console logging',
      );
    }
    if (!env['CORS_ORIGINS']) {
      warnings.push(
        'CORS_ORIGINS is not set; cross-origin browser requests will be rejected (native apps are unaffected)',
      );
    }
    if (!env['SMTP_HOST']) {
      warnings.push('SMTP_HOST is not set; email notifications will fail');
    }
    if (!env['TURN_URLS'] || !env['TURN_SHARED_SECRET']) {
      warnings.push('TURN_URLS/TURN_SHARED_SECRET are not set; WebRTC calls may fail behind NAT');
    }
    if (env['STRIPE_SECRET_KEY'] && !env['STRIPE_WEBHOOK_SECRET']) {
      errors.push('STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set');
    }
    if (env['STRIPE_SECRET_KEY']?.startsWith('sk_test_')) {
      warnings.push('STRIPE_SECRET_KEY is a test key; card payments will not settle real money');
    }
    if (!env['PAYMENT_CHECKOUT_BASE_URL']) {
      warnings.push(
        'PAYMENT_CHECKOUT_BASE_URL is not set; JazzCash/Easypaisa checkouts will use the placeholder host',
      );
    }
  }

  for (const key of ['DATABASE_POOL_MAX', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_SECONDS']) {
    const raw = env[key];
    if (raw === undefined || raw === '') continue;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push(`${key} must be a positive number (received "${raw}")`);
    }
  }

  if (warnings.length > 0) {
    for (const warning of warnings) {
      // Logger is not available yet at this point in the bootstrap.
      console.warn(`[env] ${warning}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
}
