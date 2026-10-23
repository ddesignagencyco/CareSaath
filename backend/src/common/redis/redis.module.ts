import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /** Delete every key matching `pattern` (SCAN-based, safe on large keyspaces). */
  async deleteByPattern(pattern: string): Promise<void> {
    const keys: string[] = [];
    for await (const batch of this.client.scanStream({ match: pattern, count: 100 })) {
      keys.push(...(batch as string[]));
    }
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
