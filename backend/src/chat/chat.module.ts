import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength, MaxLength } from 'class-validator';
import { UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

export class SendMessageDto {
  @ApiProperty({ example: 'Running 10 minutes late, sorry!' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

/**
 * Booking-scoped in-app chat between the customer and the assigned caregiver.
 * One thread per booking (covers every visit under a recurring booking too).
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** The booking, only if the caller is the customer, the assigned caregiver, or an admin. */
  private async bookingForParty(user: AuthUser, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        ...(user.role === UserRole.ADMIN
          ? {}
          : user.role === UserRole.CUSTOMER
            ? { customerId: user.sub }
            : { caregiver: { userId: user.sub } }),
      },
      select: { id: true, customerId: true, caregiver: { select: { userId: true } } },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  async send(user: AuthUser, bookingId: string, dto: SendMessageDto) {
    const booking = await this.bookingForParty(user, bookingId);
    const message = await this.prisma.chatMessage.create({
      data: { bookingId, senderId: user.sub, body: dto.body },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'chat.message.sent',
      entityType: 'ChatMessage',
      entityId: message.id,
      metadata: { bookingId },
    });
    const recipientId = user.sub === booking.customerId ? booking.caregiver.userId : booking.customerId;
    this.realtime?.entityUpdated(
      { users: [recipientId] },
      { type: 'chat_message', id: message.id, action: 'created', data: { bookingId, senderId: user.sub, body: message.body } },
    );
    return message;
  }

  async list(user: AuthUser, bookingId: string, query: ListMessagesQueryDto): Promise<Paginated<unknown>> {
    const booking = await this.bookingForParty(user, bookingId);
    const where = { bookingId: booking.id };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.chatMessage.count({ where }),
      this.prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  /** Marks every message not sent by the caller as read. */
  async markRead(user: AuthUser, bookingId: string): Promise<{ updated: number }> {
    const booking = await this.bookingForParty(user, bookingId);
    const result = await this.prisma.chatMessage.updateMany({
      where: { bookingId: booking.id, senderId: { not: user.sub }, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}

@ApiTags('System & Notifications')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.CAREGIVER, UserRole.ADMIN)
@Controller('bookings/:bookingId/messages')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({
    summary: 'List chat messages for a booking',
    description: 'In-app chat history between the customer and the assigned caregiver, newest first.',
  })
  list(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.chat.list(user, bookingId, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Send a chat message',
    description: 'Sends a message on this booking\'s chat thread; the other party is notified live.',
  })
  send(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(user, bookingId, dto);
  }

  @Patch('read')
  @ApiOperation({
    summary: 'Mark messages as read',
    description: 'Marks every message from the other party on this booking as read.',
  })
  markRead(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.chat.markRead(user, bookingId);
  }
}

@Module({
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
