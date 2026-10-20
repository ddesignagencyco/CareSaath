import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(import.meta.dirname, '../../.env'), override: true });

const { PrismaClient, Specialty, UserRole } = await import(
  '../dist/generated/prisma/client.js'
);
const { PrismaPg } = await import('@prisma/adapter-pg');

const COMMISSION_DEFAULT_PERCENTAGE = 20;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const adminPhone = process.env['ADMIN_PHONE'] ?? '+923000000000';
await prisma.user.upsert({
  where: { phone: adminPhone },
  update: { role: UserRole.ADMIN },
  create: { phone: adminPhone, role: UserRole.ADMIN, fullName: 'Platform Admin' },
});
console.log(`Seeded admin user ${adminPhone}`);

for (const category of Object.values(Specialty)) {
  await prisma.commissionRate.upsert({
    where: { category },
    update: {},
    create: { category, percentage: COMMISSION_DEFAULT_PERCENTAGE },
  });
}
console.log(`Seeded commission rates: ${Object.values(Specialty).join(', ')}`);

await prisma.$disconnect();
