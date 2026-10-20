import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
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
    const where = { userId: user.sub };
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
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.listForUser(user, query);
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
