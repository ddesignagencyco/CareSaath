import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '../generated/prisma/client.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  NotificationChannelAdapter,
  PushChannelAdapter,
  SmsChannelAdapter,
  WhatsAppChannelAdapter,
} from './channels.js';

export interface NotifyInput {
  userId: string;
  phone?: string | null;
  event: string;
  payload: Prisma.InputJsonObject;
  message?: string;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ enum: NotificationChannel, description: 'Only notifications delivered over this channel (e.g. PUSH for the in-app feed)' })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ description: 'true: only unread; false: only read' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class MarkNotificationsReadDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Notification IDs to mark as read' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({ example: '2026-10-23T09:00:00.000Z', description: 'Mark everything created at or before this time as read. With neither ids nor before, all unread notifications are marked.' })
  @IsOptional()
  @IsDateString()
  before?: string;
}

/**
 * Notifications (FR-C10, TRD §6.7): status-change events are persisted as
 * in-app records and, when a phone is supplied, dispatched over SMS (dev logs
 * the message). WhatsApp/push channels are TBD in the TRD.
 */
@Injectable()
export class NotificationsService {
  private readonly adapters: NotificationChannelAdapter[];

  constructor(
    private readonly prisma: PrismaService,
    smsAdapter: SmsChannelAdapter,
    whatsappAdapter: WhatsAppChannelAdapter,
    pushAdapter: PushChannelAdapter,
  ) {
    this.adapters = [pushAdapter, smsAdapter, whatsappAdapter];
  }

  /** Persist + dispatch one notification. Never throws into the request path. */
  async notify(input: NotifyInput): Promise<void> {
    try {
      for (const adapter of this.adapters) {
        if (!adapter.enabled()) {
          continue;
        }
        const requiresPhone =
          adapter.channel !== NotificationChannel.PUSH;
        if (requiresPhone && !input.phone) {
          continue;
        }
        const created = await this.prisma.notification.create({
          data: {
            userId: input.userId,
            channel: adapter.channel,
            event: input.event,
            payload: input.payload,
            status: NotificationStatus.QUEUED,
          },
        });
        try {
          await adapter.send({
            phone: input.phone,
            message: input.message,
            event: input.event,
          });
          await this.prisma.notification.update({
            where: { id: created.id },
            data: { status: NotificationStatus.SENT, sentAt: new Date() },
          });
        } catch {
          await this.prisma.notification.update({
            where: { id: created.id },
            data: { status: NotificationStatus.FAILED },
          });
        }
      }
    } catch {
      // Notification failures must not fail the originating business action.
    }
  }

  async listForUser(user: AuthUser, query: ListNotificationsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.NotificationWhereInput = {
      userId: user.sub,
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.unread === undefined ? {} : { readAt: query.unread ? null : { not: null } }),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  async markRead(user: AuthUser, dto: MarkNotificationsReadDto): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId: user.sub,
        readAt: null,
        ...(dto.ids ? { id: { in: dto.ids } } : {}),
        ...(dto.before ? { createdAt: { lte: new Date(dto.before) } } : {}),
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}

@ApiTags('System & Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List user notifications',
    description: 'Retrieves notification history (SMS, Push, WhatsApp) sent to the authenticated user, newest first. Each row has readAt (null while unread). Filter with ?channel=PUSH and ?unread=true.',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.listForUser(user, query);
  }

  @Post('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark notifications as read',
    description: 'Marks the given notification IDs, or everything created at or before "before", as read. With no body fields all unread notifications are marked. Returns the number updated.',
  })
  markRead(@CurrentUser() user: AuthUser, @Body() dto: MarkNotificationsReadDto) {
    return this.notifications.markRead(user, dto);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SmsChannelAdapter,
    WhatsAppChannelAdapter,
    PushChannelAdapter,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
