/**
 * Provision (or promote) the first platform admin without running the demo
 * seed, which refuses to execute in production.
 *
 *   ADMIN_PHONE=+923001234567 ADMIN_NAME="Ops Admin" npm run admin:create
 *
 * Run `npm run build` first; this script uses the compiled Prisma client.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(import.meta.dirname, '../../.env') });

const phone = process.env['ADMIN_PHONE']?.trim();
if (!phone) {
  console.error('ADMIN_PHONE is required (E.164, e.g. +923001234567).');
  process.exit(1);
}
if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
  console.error(`ADMIN_PHONE must be E.164 (received "${phone}").`);
  process.exit(1);
}
if (!process.env['DATABASE_URL']) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

let PrismaClient;
let UserRole;
let PrismaPg;
try {
  ({ PrismaClient, UserRole } = await import('../dist/generated/prisma/client.js'));
  ({ PrismaPg } = await import('@prisma/adapter-pg'));
} catch (error) {
  console.error('Compiled Prisma client not found. Run `npm run build` first.');
  console.error(String(error));
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const fullName = process.env['ADMIN_NAME']?.trim() || 'Platform Admin';
const user = await prisma.user.upsert({
  where: { phone },
  update: { role: UserRole.ADMIN, fullName },
  create: { phone, role: UserRole.ADMIN, fullName },
});

console.log(`Admin ready: ${user.phone} (${user.id})`);
await prisma.$disconnect();
