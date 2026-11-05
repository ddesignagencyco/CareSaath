import {
  BadRequestException,
  Body,
  Controller,
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
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DevicePlatform,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '../generated/prisma/client.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeEvents, RealtimeService } from '../realtime/realtime.service.js';
import { EmailModule } from '../email/email.module.js';
import { eventDefinition } from './events.js';
import {
  EmailChannelAdapter,
  isCriticalNotificationEvent,
  NotificationChannelAdapter,
  PushChannelAdapter,
  SmsChannelAdapter,
  WhatsAppChannelAdapter,
} from './channels.js';
import { WebPushService } from './web-push.service.js';
import { NativePushService } from './native-push.service.js';
import { FirebaseModule } from '../firebase/firebase.module.js';

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
  @ApiProperty({ description: 'Base64url P-256 public key from PushSubscription.toJSON().keys.p256dh' })
  @IsString()
  @MaxLength(256)
  p256dh!: string;

  @ApiProperty({ description: 'Base64url auth secret from PushSubscription.toJSON().keys.auth' })
  @IsString()
  @MaxLength(128)
  auth!: string;
}

export class PushSubscribeDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc…', description: 'PushSubscription.endpoint' })
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  endpoint!: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Firebase Cloud Messaging registration token from the native app (messaging().getToken())' })
  @IsString()
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.ANDROID })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}

export class UnregisterDeviceDto {
  @ApiProperty({ description: 'The FCM registration token to remove' })
  @IsString()
  @MaxLength(4096)
  token!: string;
}

export class PushUnsubscribeDto {
  @ApiProperty({ description: 'The endpoint to remove (PushSubscription.endpoint)' })
  @IsString()
  @MaxLength(2048)
  endpoint!: string;
}

/**
 * Notifications (FR-C10, TRD §6.7): status-change events are persisted as
 * in-app records and, when a phone is supplied, dispatched over SMS (dev logs
 * the message). WhatsApp/push channels are TBD in the TRD.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly adapters: NotificationChannelAdapter[];

  constructor(
    private readonly prisma: PrismaService,
    smsAdapter: SmsChannelAdapter,
    whatsappAdapter: WhatsAppChannelAdapter,
    pushAdapter: PushChannelAdapter,
    emailAdapter: EmailChannelAdapter,
    @Optional() private readonly realtime?: RealtimeService,
    @Optional() private readonly webPush?: WebPushService,
    @Optional() private readonly nativePush?: NativePushService,
  ) {
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
            phone: input.phone,
            email: recipient.email,
            title,
            message: input.message,
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
            // ...and to their closed tabs (Web Push) and phones (FCM), fire-and-forget.
            const pushPayload = {
              id: created.id,
              event: input.event,
              title,
              body: input.message ?? null,
              data: input.payload,
            };
            void this.webPush?.sendToUser(input.userId, pushPayload);
            void this.nativePush?.sendToUser(input.userId, pushPayload);
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

  pushConfig(): { enabled: boolean; vapidPublicKey: string | null } {
    const vapidPublicKey = this.webPush?.vapidPublicKey() ?? null;
    return { enabled: vapidPublicKey !== null, vapidPublicKey };
  }

  /** Stores (or re-assigns to the caller) one browser push subscription. Idempotent per endpoint. */
  async subscribePush(user: AuthUser, dto: PushSubscribeDto, userAgent?: string) {
    if (!this.webPush?.enabled()) {
      throw new BadRequestException('Web push is not configured on this server');
    }
    const sub = await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { userId: user.sub, p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent: userAgent ?? null },
      create: {
        userId: user.sub,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: userAgent ?? null,
      },
    });
    return { id: sub.id, endpoint: sub.endpoint, createdAt: sub.createdAt };
  }

  /** Removes one of the caller's subscriptions (e.g. on logout or permission revoked). */
  async unsubscribePush(user: AuthUser, dto: PushUnsubscribeDto): Promise<{ removed: number }> {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { endpoint: dto.endpoint, userId: user.sub },
    });
    return { removed: result.count };
  }

  /**
   * Stores (or re-assigns to the caller) one native app's FCM token. Idempotent per
   * token: the same phone signing in as another account moves the token over, so a
   * device only ever receives the pushes of whoever is signed in on it.
   */
  async registerDevice(user: AuthUser, dto: RegisterDeviceDto) {
    const device = await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: { userId: user.sub, platform: dto.platform },
      create: { userId: user.sub, token: dto.token, platform: dto.platform },
    });
    return { id: device.id, platform: device.platform, enabled: this.nativePush?.enabled() ?? false };
  }

  /** Removes one of the caller's device tokens (on logout or when the app's token changes). */
  async unregisterDevice(user: AuthUser, dto: UnregisterDeviceDto): Promise<{ removed: number }> {
    const result = await this.prisma.deviceToken.deleteMany({
      where: { token: dto.token, userId: user.sub },
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

  @Get('push/public-key')
  @ApiOperation({
    summary: 'Web Push config (VAPID public key)',
    description: 'Returns { enabled, vapidPublicKey } — pass vapidPublicKey as applicationServerKey to PushManager.subscribe(). enabled=false (key null) until the server has VAPID keys.',
  })
  pushConfig() {
    return this.notifications.pushConfig();
  }

  @Post('push/subscribe')
  @ApiOperation({
    summary: 'Register a browser push subscription',
    description: 'Stores PushSubscription.toJSON() ({ endpoint, keys: { p256dh, auth } }) for the caller; every in-app notification is then also sent as a Web Push to it (respecting the PUSH channel preference). Idempotent per endpoint. 400 when the server has no VAPID keys.',
  })
  subscribePush(
    @CurrentUser() user: AuthUser,
    @Body() dto: PushSubscribeDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notifications.subscribePush(user, dto, userAgent?.slice(0, 500));
  }

  @Post('push/unsubscribe')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remove a browser push subscription',
    description: 'Deletes the caller\'s subscription with this endpoint (e.g. on logout).',
  })
  unsubscribePush(@CurrentUser() user: AuthUser, @Body() dto: PushUnsubscribeDto) {
    return this.notifications.unsubscribePush(user, dto);
  }

  @Post('devices')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Register a native app device for push',
    description: 'Stores the app\'s FCM registration token for the caller; every in-app notification is then also sent to that phone through Firebase Cloud Messaging (respecting the PUSH channel preference). Idempotent per token; call again whenever the token changes. Returns enabled=false while the server has no Firebase credentials.',
  })
  registerDevice(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(user, dto);
  }

  @Post('devices/remove')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remove a native app device',
    description: 'Deletes the caller\'s FCM token (call on logout, before the session is cleared).',
  })
  unregisterDevice(@CurrentUser() user: AuthUser, @Body() dto: UnregisterDeviceDto) {
    return this.notifications.unregisterDevice(user, dto);
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
  imports: [EmailModule, FirebaseModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SmsChannelAdapter,
    WhatsAppChannelAdapter,
    PushChannelAdapter,
    EmailChannelAdapter,
    WebPushService,
    NativePushService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
