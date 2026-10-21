import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Default size of the PostgreSQL connection pool. The `pg` driver falls back
 * to 10 connections when nothing is configured, which serialises the write
 * path (booking creation, audit log, notifications) well before the database
 * itself is saturated — the k6 load test in `load/k6` shows write p95 of 2.3 s
 * at 100 concurrent users on a 10-connection pool against 2.3 s of database
 * work.
 *
 * Keep the total across all instances below the server's `max_connections`
 * (100 by default).
 */
const DEFAULT_POOL_MAX = 20;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env['DATABASE_URL'],
      max: Number(process.env['DATABASE_POOL_MAX'] ?? DEFAULT_POOL_MAX),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
