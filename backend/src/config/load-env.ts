import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Must be the first import of `main.ts`. Several modules derive their
 * encryption keys at import time, which happens before `ConfigModule.forRoot`
 * reads the root `.env`; loading it here keeps the API on the same keys as the
 * seed script. Variables already set in the environment win.
 */
for (const path of ['../.env', '.env']) {
  loadEnv({ path: resolve(process.cwd(), path), quiet: true });
}
