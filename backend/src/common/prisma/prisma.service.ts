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
      // TCP keepalive stops Docker/NAT from silently reaping idle connections — otherwise the first
      // request after a quiet spell fails with Prisma "Server has closed the connection".
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    });
    super({ adapter });
  }

  private keepAlive?: NodeJS.Timeout;

  async onModuleInit() {
    await this.$connect();
    // Docker-on-Windows (and some hosts) silently reap idle TCP connections, which surfaces as
    // Prisma "Server has closed the connection" on the first request after a quiet spell. A
    // lightweight periodic ping keeps the pooled connection warm so idle gaps don't break requests.
    const ms = Number(process.env['DATABASE_KEEPALIVE_MS'] ?? 25_000);
    if (ms > 0) {
      this.keepAlive = setInterval(() => {
        void this.$queryRaw`SELECT 1`.catch(() => undefined);
      }, ms);
      this.keepAlive.unref?.();
    }
  }

  async onModuleDestroy() {
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
    }
    await this.$disconnect();
  }
}
