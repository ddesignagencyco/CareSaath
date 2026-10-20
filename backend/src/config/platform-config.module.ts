import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';
import { Prisma, UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';

/**
 * Operator-tunable platform settings (TRD §6.x). Values live in `PlatformConfig`
 * and are cached in Redis; env vars provide the fallback defaults. Consumers
 * read through `ConfigService.getNumber(...)` so a value can be changed by an
 * admin without a redeploy.
 */
export interface ConfigDefinition {
  key: string;
  /** Numeric env fallback (used when no DB row exists). */
  envVar: string;
  envDefault: number;
  description: string;
}

export const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  {
    key: 'booking.respondWindowMinutes',
    envVar: 'BOOKING_RESPOND_WINDOW_MINUTES',
    envDefault: 60,
    description: 'Minutes a caregiver has to accept or decline a booking request (FR-CG5).',
  },
  {
    key: 'booking.cancelNoticeMinutes',
    envVar: 'BOOKING_CANCEL_NOTICE_MINUTES',
    envDefault: 0,
    description: 'Minimum notice (minutes) before the visit start within which a customer cannot cancel (FR-C13).',
  },
  {
    key: 'otp.ttlSeconds',
    envVar: 'OTP_TTL_SECONDS',
    envDefault: 300,
    description: 'Login OTP lifetime in seconds.',
  },
  {
    key: 'otp.checkinTtlSeconds',
    envVar: 'CHECKIN_OTP_TTL_SECONDS',
    envDefault: 600,
    description: 'Visit check-in OTP lifetime in seconds (FR-CG7).',
  },
  {
    key: 'retention.notificationDays',
    envVar: 'RETENTION_NOTIFICATION_DAYS',
    envDefault: 90,
    description: 'Days to keep delivered notifications before cleanup.',
  },
  {
    key: 'search.cacheTtlSeconds',
    envVar: 'SEARCH_CACHE_TTL_SECONDS',
    envDefault: 30,
    description: 'Redis TTL for cached public caregiver search results.',
  },
];

const CONFIG_CACHE_TTL_SECONDS = 60;
const CONFIG_CACHE_PREFIX = 'config:';
const CONFIG_BY_KEY = new Map(CONFIG_DEFINITIONS.map((d) => [d.key, d]));

export class SetConfigDto {
  @ApiProperty({ description: 'Numeric value for the setting.' })
  @IsNumber()
  @Min(0)
  value!: number;
}

@Injectable()
export class ConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  private envDefault(def: ConfigDefinition): number {
    const raw = process.env[def.envVar];
    return raw !== undefined ? Number(raw) : def.envDefault;
  }

  /** Resolve a single numeric setting: Redis cache -> DB row -> env default. */
  async getNumber(key: string): Promise<number> {
    const def = CONFIG_BY_KEY.get(key);
    if (!def) {
      throw new Error(`Unknown config key: ${key}`);
    }
    const cacheKey = `${CONFIG_CACHE_PREFIX}${key}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached !== null) {
      return Number(cached);
    }
    const row = await this.prisma.platformConfig.findUnique({ where: { key } });
    const value = row ? this.coerce(row.value) : this.envDefault(def);
    await this.redis.client.set(cacheKey, String(value), 'EX', CONFIG_CACHE_TTL_SECONDS);
    return value;
  }

  private coerce(value: Prisma.JsonValue): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'value' in value) {
      return Number((value as { value: unknown }).value);
    }
    return Number.NaN;
  }

  /** Effective values for every known setting (DB override or env default). */
  async resolved(): Promise<Array<ConfigDefinition & { value: number; overridden: boolean }>> {
    const rows = await this.prisma.platformConfig.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return CONFIG_DEFINITIONS.map((def) => {
      const row = byKey.get(def.key);
      return {
        ...def,
        value: row ? this.coerce(row.value) : this.envDefault(def),
        overridden: Boolean(row),
      };
    });
  }

  async set(admin: AuthUser, key: string, value: number): Promise<ConfigDefinition & { value: number }> {
    const def = CONFIG_BY_KEY.get(key);
    if (!def) {
      throw new Error(`Unknown config key: ${key}`);
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Config value must be a non-negative number');
    }
    await this.prisma.platformConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    await this.redis.client.del(`${CONFIG_CACHE_PREFIX}${key}`);
    await this.audit.log({
      actorId: admin.sub,
      action: 'config.updated',
      entityType: 'PlatformConfig',
      entityId: key,
      metadata: { value },
    });
    return { ...def, value };
  }
}

@ApiTags('Admin - Promos & Config')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/config')
export class AdminConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'List platform runtime parameters',
    description: 'Retrieves tunable operational parameters (booking response windows, OTP TTLs, retention days).',
  })
  list() {
    return this.config.resolved();
  }

  @Put(':key')
  @ApiOperation({
    summary: 'Update platform parameter',
    description: 'Admin tunes an operational setting at runtime without requiring application restart.',
  })
  update(
    @CurrentUser() admin: AuthUser,
    @Param('key') key: string,
    @Body() dto: SetConfigDto,
  ) {
    return this.config.set(admin, key, dto.value);
  }
}

@Module({
  controllers: [AdminConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class PlatformConfigModule {}
