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
import { SmsService } from '../auth/sms.service.js';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  /** Persist + dispatch one notification. Never throws into the request path. */
  async notify(input: NotifyInput): Promise<void> {
    const records: Array<{ channel: NotificationChannel; status: NotificationStatus }> = [
      { channel: NotificationChannel.PUSH, status: NotificationStatus.SENT },
    ];
    if (input.phone) {
      records.push({ channel: NotificationChannel.SMS, status: NotificationStatus.QUEUED });
    }
    try {
      for (const record of records) {
        const created = await this.prisma.notification.create({
          data: {
            userId: input.userId,
            channel: record.channel,
            event: input.event,
            payload: input.payload,
            status: record.status,
            sentAt: record.status === NotificationStatus.SENT ? new Date() : null,
          },
        });
        if (record.channel === NotificationChannel.SMS && input.message && input.phone) {
          await this.sms.sendVisitAlert(input.phone, input.message);
          await this.prisma.notification.update({
            where: { id: created.id },
            data: { status: NotificationStatus.SENT, sentAt: new Date() },
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
  providers: [NotificationsService, SmsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
