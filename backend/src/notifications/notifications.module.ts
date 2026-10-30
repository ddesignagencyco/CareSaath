import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Optional,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
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
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '../generated/prisma/client.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeEvents, RealtimeService } from '../realtime/realtime.service.js';
import { SmsService } from '../auth/sms.service.js';
import { EmailModule } from '../email/email.module.js';
import { eventDefinition } from './events.js';
import {
  EmailChannelAdapter,
  isAllowedPushEndpoint,
  isCriticalNotificationEvent,
  NotificationChannelAdapter,
  PushChannelAdapter,
  SmsChannelAdapter,
  WhatsAppChannelAdapter,
} from './channels.js';

export interface NotifyInput {
  userId: string;
  phone?: string | null;
  /** Must be declared in NOTIFICATION_EVENTS (src/notifications/events.ts). */
  event: string;
  payload: Prisma.InputJsonObject;
  message?: string;
  /** Overrides the catalogue title for this one notification. */
  title?: string;
}

export type NotifyAdminsInput = Omit<NotifyInput, 'userId' | 'phone'>;

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ enum: NotificationChannel, description: 'Delivery channel. Defaults to PUSH, the in-app feed (one row per notification). SMS / WHATSAPP rows are delivery logs.' })
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

export class UpdateNotificationPreferenceDto {
  @ApiProperty({ enum: NotificationChannel, description: 'Channel to opt in/out of.' })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty({ description: 'false opts the channel out; true opts it back in.' })
  @IsBoolean()
  enabled!: boolean;
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

export class PushSubscriptionKeysDto {
  @ApiProperty({ description: 'Browser public key from PushSubscription.toJSON().keys.p256dh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh!: string;

  @ApiProperty({ description: 'Browser auth secret from PushSubscription.toJSON().keys.auth' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth!: string;
}

export class RegisterPushSubscriptionDto {
  @ApiProperty({
    description: 'Push service endpoint from PushSubscription.toJSON().endpoint',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  endpoint!: string;

  @ApiProperty({ type: () => PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @ApiPropertyOptional({ example: 'WEB', description: 'Client platform; defaults to WEB' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  platform?: string;
}

export class UnregisterPushSubscriptionDto {
  @ApiProperty({ description: 'Endpoint to remove for the caller' })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  endpoint!: string;
}

/**
 * Notifications (FR-C10, TRD A6.7): status-change events are persisted as
 * in-app records and dispatched over SMS, WhatsApp, email and browser Web Push
 * according to the recipient's channel preferences.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly adapters: NotificationChannelAdapter[];
  private readonly pushAdapter: PushChannelAdapter;

  constructor(
    private readonly prisma: PrismaService,
    smsAdapter: SmsChannelAdapter,
    whatsappAdapter: WhatsAppChannelAdapter,
    pushAdapter: PushChannelAdapter,
    emailAdapter: EmailChannelAdapter,
    @Optional() private readonly realtime?: RealtimeService,
  ) {
    this.pushAdapter = pushAdapter;
    this.adapters = [pushAdapter, smsAdapter, whatsappAdapter, emailAdapter];
  }

  /**
   * Persist + dispatch one notification, and push it live to the recipient's
   * open sessions. The event is checked against the catalogue: an unknown event,
   * or one addressed to a user whose role it is not meant for, is dropped and
   * logged instead of leaking into the wrong feed. Never throws into the request path.
   */
  async notify(input: NotifyInput): Promise<void> {
    try {
      const definition = eventDefinition(input.event);
      if (!definition) {
        this.logger.warn(`Dropped notification with undeclared event "${input.event}"`);
        return;
      }
      const recipient = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { role: true, email: true },
      });
      if (!recipient) {
        return;
      }
      if (!definition.audience.includes(recipient.role)) {
        this.logger.warn(
          `Dropped "${input.event}" for user ${input.userId}: it is for ${definition.audience.join('/')}, not ${recipient.role}`,
        );
        return;
      }
      const title = input.title ?? definition.title;
      const bypassPreferences = isCriticalNotificationEvent(input.event);
      const disabledChannels = bypassPreferences
        ? new Set<NotificationChannel>()
        : new Set(
            (
              await this.prisma.notificationPreference.findMany({
                where: { userId: input.userId, enabled: false },
                select: { channel: true },
              })
            ).map((p) => p.channel),
          );
      for (const adapter of this.adapters) {
        if (!adapter.enabled()) {
          continue;
        }
        if (disabledChannels.has(adapter.channel)) {
          continue;
        }
        if (
          (adapter.channel === NotificationChannel.SMS ||
            adapter.channel === NotificationChannel.WHATSAPP) &&
          !input.phone
        ) {
          continue;
        }
        if (adapter.channel === NotificationChannel.EMAIL && !recipient.email) {
          continue;
        }
        const created = await this.prisma.notification.create({
          data: {
            userId: input.userId,
            channel: adapter.channel,
            event: input.event,
            payload: input.payload,
            status: NotificationStatus.QUEUED,
            title,
            body: input.message ?? null,
            audienceRole: recipient.role,
          },
        });
        try {
          await adapter.send({
            userId: input.userId,
            notificationId: created.id,
            phone: input.phone,
            email: recipient.email,
            title,
            message: input.message,
            payload: input.payload as Record<string, unknown>,
            event: input.event,
          });
          const sent = await this.prisma.notification.update({
            where: { id: created.id },
            data: { status: NotificationStatus.SENT, sentAt: new Date() },
          });
          if (adapter.channel === NotificationChannel.PUSH) {
            // The PUSH row is the in-app feed entry: deliver it live to this user's sessions.
            this.realtime?.emit(
              { users: [input.userId] },
              RealtimeEvents.notificationCreated,
              { ...created, ...sent, readAt: null },
            );
          }
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

  /** Notify every active admin (in-app only; admins are not texted for routine events). */
  async notifyAdmins(input: NotifyAdminsInput): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      await Promise.all(admins.map((admin) => this.notify({ ...input, userId: admin.id })));
    } catch {
      // Never fail the originating action over an alert.
    }
  }

  /** The caller's feed: only their current role's rows, one row per notification (in-app channel). */
  private feedWhere(user: AuthUser, channel?: NotificationChannel): Prisma.NotificationWhereInput {
    return {
      userId: user.sub,
      audienceRole: user.role as UserRole,
      channel: channel ?? NotificationChannel.PUSH,
    };
  }

  async unreadCount(user: AuthUser): Promise<{ unread: number }> {
    const unread = await this.prisma.notification.count({
      where: { ...this.feedWhere(user), readAt: null },
    });
    return { unread };
  }

  async listForUser(user: AuthUser, query: ListNotificationsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.NotificationWhereInput = {
      ...this.feedWhere(user, query.channel),
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
        ...this.feedWhere(user),
        readAt: null,
        ...(dto.ids ? { id: { in: dto.ids } } : {}),
        ...(dto.before ? { createdAt: { lte: new Date(dto.before) } } : {}),
      },
      data: { readAt: new Date() },
    });
    if (result.count > 0) {
      // Keep the user's other open tabs/devices in sync.
      this.realtime?.emit({ users: [user.sub] }, RealtimeEvents.notificationRead, {
        ids: dto.ids ?? null,
        before: dto.before ?? null,
      });
    }
    return { updated: result.count };
  }

  /** The VAPID public key browsers need to subscribe; null when push is unconfigured. */
  pushPublicKey(): { enabled: boolean; publicKey: string | null } {
    const publicKey = this.pushAdapter.publicVapidKey ?? null;
    return { enabled: Boolean(publicKey), publicKey };
  }

  /**
   * Register or refresh one browser/device subscription. The endpoint is unique
   * across users: on a shared browser the latest signed-in user takes it over
   * instead of the previous user continuing to receive pushes there.
   */
  async registerPushSubscription(
    user: AuthUser,
    dto: RegisterPushSubscriptionDto,
    userAgent?: string,
  ) {
    if (!isAllowedPushEndpoint(dto.endpoint)) {
      throw new BadRequestException(
        'Push endpoint must be an HTTPS URL from a supported push service',
      );
    }
    const subscription = await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: {
        userId: user.sub,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        platform: (dto.platform?.trim() || 'WEB').toUpperCase(),
        userAgent: userAgent?.trim() || null,
        failureCount: 0,
      },
      create: {
        userId: user.sub,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        platform: (dto.platform?.trim() || 'WEB').toUpperCase(),
        userAgent: userAgent?.trim() || null,
      },
    });
    return {
      id: subscription.id,
      endpoint: subscription.endpoint,
      platform: subscription.platform,
    };
  }

  async listPushSubscriptions(user: AuthUser) {
    return this.prisma.pushSubscription.findMany({
      where: { userId: user.sub },
      select: {
        id: true,
        endpoint: true,
        platform: true,
        failureCount: true,
        lastSuccessAt: true,
        lastFailureAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async unregisterPushSubscription(user: AuthUser, dto: UnregisterPushSubscriptionDto) {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { userId: user.sub, endpoint: dto.endpoint },
    });
    return { removed: result.count };
  }

  /** Every channel, defaulting to enabled when the caller has no saved preference for it. */
  async listPreferences(user: AuthUser): Promise<Array<{ channel: NotificationChannel; enabled: boolean }>> {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId: user.sub } });
    const saved = new Map(rows.map((row) => [row.channel, row.enabled]));
    return Object.values(NotificationChannel).map((channel) => ({
      channel,
      enabled: saved.get(channel) ?? true,
    }));
  }

  async updatePreference(user: AuthUser, dto: UpdateNotificationPreferenceDto) {
    await this.prisma.notificationPreference.upsert({
      where: { userId_channel: { userId: user.sub, channel: dto.channel } },
      update: { enabled: dto.enabled },
      create: { userId: user.sub, channel: dto.channel, enabled: dto.enabled },
    });
    return this.listPreferences(user);
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
    description: 'In-app notification feed for the caller, newest first. Only notifications meant for the caller\'s role are returned, one row per notification. Each row has title, body and readAt (null while unread). New ones arrive live as notification.created over the socket. Filter with ?unread=true; ?channel=SMS|WHATSAPP shows the delivery log instead.',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.listForUser(user, query);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Count unread notifications',
    description: 'Unread in-app notifications for the caller\'s current role. Kept live by the notification.created / notification.read socket events.',
  })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
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

  @Public()
  @Get('push/public-key')
  @ApiOperation({
    summary: 'Get the Web Push VAPID public key',
    description: 'Public VAPID key the browser passes to pushManager.subscribe. Returns enabled=false and publicKey=null when Web Push is not configured on the server.',
  })
  pushPublicKey() {
    return this.notifications.pushPublicKey();
  }

  @Post('push/subscriptions')
  @ApiOperation({
    summary: 'Register a browser push subscription',
    description: 'Stores or refreshes the caller\'s PushSubscription JSON (endpoint + p256dh/auth keys). Re-registering the same endpoint is idempotent and reassigns it to the current user.',
  })
  registerPushSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterPushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notifications.registerPushSubscription(user, dto, userAgent);
  }

  @Get('push/subscriptions')
  @ApiOperation({
    summary: 'List the caller\'s push subscriptions',
    description: 'Registered browsers/devices with delivery timestamps. Use this to decide whether to re-subscribe after a permission reset.',
  })
  listPushSubscriptions(@CurrentUser() user: AuthUser) {
    return this.notifications.listPushSubscriptions(user);
  }

  @Delete('push/subscriptions')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Unregister a browser push subscription',
    description: 'Removes the endpoint for the caller only. Call this on logout or when the browser permission is revoked.',
  })
  unregisterPushSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: UnregisterPushSubscriptionDto,
  ) {
    return this.notifications.unregisterPushSubscription(user, dto);
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Get notification channel preferences',
    description: 'Per-channel opt-in/opt-out for the caller (SMS / WHATSAPP / PUSH / EMAIL). A channel with no saved preference defaults to enabled.',
  })
  listPreferences(@CurrentUser() user: AuthUser) {
    return this.notifications.listPreferences(user);
  }

  @Patch('preferences')
  @ApiOperation({
    summary: 'Update a notification channel preference',
    description: 'Opts one channel in or out for the caller. Safety-critical alerts (e.g. SOS) are always delivered regardless of this setting.',
  })
  updatePreference(@CurrentUser() user: AuthUser, @Body() dto: UpdateNotificationPreferenceDto) {
    return this.notifications.updatePreference(user, dto);
  }
}

@Module({
  imports: [EmailModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SmsService,
    SmsChannelAdapter,
    WhatsAppChannelAdapter,
    PushChannelAdapter,
    EmailChannelAdapter,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
