import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './common/prisma/prisma.service.js';
import { RedisService } from './common/redis/redis.module.js';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('PostgreSQL unavailable');
    }
    const redisOk = await this.redis.ping();
    if (!redisOk) {
      throw new ServiceUnavailableException('Redis unavailable');
    }
    return { status: 'ok', postgres: true, redis: true };
  }
}
