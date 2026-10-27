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
    description: 'Quick health check - app is running and ready to serve requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'API is healthy and operational.',
    schema: {
      example: { status: 'ok' },
    },
  })
  health() {
    return { status: 'ok' };
  }
}
