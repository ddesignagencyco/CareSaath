import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';
import { PrismaService } from './common/prisma/prisma.service.js';
import { RedisService } from './common/redis/redis.module.js';

@ApiTags('System & Health')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Platform health status',
    description: 'Checks connectivity to PostgreSQL database and Redis caching store.',
  })
  @ApiResponse({
    status: 200,
    description: 'Services are healthy and operational.',
    schema: {
      example: { status: 'ok', postgres: true, redis: true },
    },
  })
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
