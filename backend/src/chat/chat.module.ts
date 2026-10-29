import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Optional,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import { BookingStatus, ChatMessageType, Prisma, UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';
import { StorageService, withFileUrl } from '../common/storage/storage.module.js';
import { RealtimeService } from '../realtime/realtime.service.js';

export class SendMessageDto {
  @ApiProperty({ example: 'Running 10 minutes late, sorry!' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Message this one is replying to (must be on the same booking).' })
  @IsOptional()
  @IsUUID()
  replyToId?: string;
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

export class ReactToMessageDto {
  @ApiProperty({ example: '👍', description: 'A single emoji. Reacting again with the same emoji removes it.' })
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  emoji!: string;
}

export class InitChatUploadDto {
  @ApiProperty({ example: 'voice-note.webm' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  filename!: string;

  @ApiProperty({ example: 'audio/webm', description: 'Image, PDF, voice note, or short-video mime type.' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ example: 2_500_000, description: 'Total size of the file, in bytes.' })
  @IsInt()
  @Min(1)
  totalBytes!: number;
}

export class CompleteChatUploadDto {
  @ApiPropertyOptional({ example: 'Here you go!', description: 'Optional caption alongside the attachment.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  replyToId?: string;
}

/**
 * Booking-scoped in-app chat between the customer and the assigned caregiver.
 * One thread per booking (covers every visit under a recurring booking too).
 */
/** Upload sessions live only in Redis, bounded by this TTL (resumable within the window, then abandoned). */
const CHAT_UPLOAD_SESSION_TTL_SECONDS = Number(process.env['CHAT_UPLOAD_TTL_SECONDS'] ?? 2 * 3600);

/** image/* -> IMAGE, audio/* -> VOICE, everything else (pdf, video/*) -> FILE. */
function messageTypeForMime(mimeType: string): ChatMessageType {
  if (mimeType.startsWith('image/')) return ChatMessageType.IMAGE;
  if (mimeType.startsWith('audio/')) return ChatMessageType.VOICE;
  return ChatMessageType.FILE;
}

interface ChatUploadMeta {
  bookingId: string;
  userId: string;
  filename: string;
  mimeType: string;
  totalBytes: number;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly redis?: RedisService,
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
      select: { id: true, status: true, customerId: true, caregiver: { select: { userId: true } } },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  /** The thread opens once the booking is CONFIRMED and is read-only once it's closed (completed/cancelled/declined). */
  private assertBookingWritable(booking: { status: BookingStatus }): void {
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `This chat is read-only while the booking is ${booking.status}`,
      );
    }
  }

  private messageInclude() {
    return {
      reactions: { select: { id: true, userId: true, emoji: true, createdAt: true } },
      replyTo: { select: { id: true, senderId: true, type: true, body: true, deletedAt: true } },
    } satisfies Prisma.ChatMessageInclude;
  }

  /** A media message's `mediaKey` becomes a viewable `url`; the raw key is never exposed. */
  private async present<T extends { mediaKey: string | null }>(message: T) {
    if (!message.mediaKey || !this.storage) {
      return { ...message, url: null };
    }
    const { url } = await withFileUrl(this.storage, { fileKey: message.mediaKey });
    const { mediaKey: _mediaKey, ...rest } = message;
    return { ...rest, url };
  }

  async send(user: AuthUser, bookingId: string, dto: SendMessageDto) {
    const booking = await this.bookingForParty(user, bookingId);
    this.assertBookingWritable(booking);
    if (dto.replyToId) {
      await this.assertReplyTargetOnBooking(dto.replyToId, bookingId);
    }
    const message = await this.prisma.chatMessage.create({
      data: { bookingId, senderId: user.sub, body: dto.body, replyToId: dto.replyToId ?? null },
      include: this.messageInclude(),
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
      {
        type: 'chat_message',
        id: message.id,
        action: 'created',
        data: { bookingId, senderId: user.sub, body: message.body, type: message.type, replyToId: message.replyToId },
      },
    );
    return this.present(message);
  }

  private async assertReplyTargetOnBooking(replyToId: string, bookingId: string): Promise<void> {
    const target = await this.prisma.chatMessage.findFirst({
      where: { id: replyToId, bookingId },
      select: { id: true },
    });
    if (!target) {
      throw new BadRequestException('replyToId must be a message on the same booking');
    }
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
        include: this.messageInclude(),
      }),
    ]);
    return paginate(await Promise.all(items.map((item) => this.present(item))), query.page, query.limit, total);
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

  /** Marks a single message as read (per-message granularity, e.g. as it scrolls into view). */
  async markOneRead(user: AuthUser, bookingId: string, messageId: string): Promise<{ updated: number }> {
    const booking = await this.bookingForParty(user, bookingId);
    const result = await this.prisma.chatMessage.updateMany({
      where: { id: messageId, bookingId: booking.id, senderId: { not: user.sub }, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Reacting again with the same emoji removes it (tap-to-toggle, like WhatsApp). */
  async react(user: AuthUser, bookingId: string, messageId: string, dto: ReactToMessageDto) {
    const booking = await this.bookingForParty(user, bookingId);
    this.assertBookingWritable(booking);
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, bookingId: booking.id },
      select: { id: true, senderId: true },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: user.sub, emoji: dto.emoji } },
    });
    const removed = Boolean(existing);
    if (existing) {
      await this.prisma.messageReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.messageReaction.create({
        data: { messageId, userId: user.sub, emoji: dto.emoji },
      });
    }
    const recipientId = user.sub === booking.customerId ? booking.caregiver.userId : booking.customerId;
    this.realtime?.emit({ users: [recipientId] }, 'message.reaction', {
      bookingId,
      messageId,
      userId: user.sub,
      emoji: dto.emoji,
      action: removed ? 'removed' : 'added',
    });
    return { ok: true as const, action: removed ? ('removed' as const) : ('added' as const) };
  }

  // ---- Resumable media uploads --------------------------------------------

  private requireRedis(): RedisService {
    if (!this.redis) {
      throw new BadRequestException('Media uploads are not available');
    }
    return this.redis;
  }

  private requireStorage(): StorageService {
    if (!this.storage) {
      throw new BadRequestException('Media uploads are not available');
    }
    return this.storage;
  }

  private uploadMetaKey(uploadId: string): string {
    return `chatupload:${uploadId}:meta`;
  }

  private uploadChunksKey(uploadId: string): string {
    return `chatupload:${uploadId}:chunks`;
  }

  private async loadUploadMeta(uploadId: string, user: AuthUser, bookingId: string): Promise<ChatUploadMeta> {
    const redis = this.requireRedis();
    const raw = await redis.client.get(this.uploadMetaKey(uploadId));
    if (!raw) {
      throw new NotFoundException('Upload session not found or expired');
    }
    const meta = JSON.parse(raw) as ChatUploadMeta;
    if (meta.bookingId !== bookingId || meta.userId !== user.sub) {
      throw new NotFoundException('Upload session not found or expired');
    }
    return meta;
  }

  /** Starts a resumable upload: validates the type/size up front and opens a bounded Redis-backed session. */
  async initUpload(user: AuthUser, bookingId: string, dto: InitChatUploadDto) {
    const booking = await this.bookingForParty(user, bookingId);
    this.assertBookingWritable(booking);
    const storage = this.requireStorage();
    storage.validateChatMediaUpload(dto.mimeType, dto.totalBytes);
    const redis = this.requireRedis();
    const uploadId = randomUUID();
    const meta: ChatUploadMeta = {
      bookingId,
      userId: user.sub,
      filename: dto.filename,
      mimeType: dto.mimeType,
      totalBytes: dto.totalBytes,
    };
    await redis.client.set(
      this.uploadMetaKey(uploadId),
      JSON.stringify(meta),
      'EX',
      CHAT_UPLOAD_SESSION_TTL_SECONDS,
    );
    return { uploadId, totalBytes: dto.totalBytes };
  }

  /**
   * Stores one chunk (idempotent by index, so a retried chunk just overwrites
   * itself). The client decides chunk boundaries; pausing is simply not
   * calling this for a while, and resuming is calling GET progress first to
   * see which indexes are already stored.
   */
  async putChunk(
    user: AuthUser,
    bookingId: string,
    uploadId: string,
    index: number,
    chunk: Buffer,
  ): Promise<{ receivedBytes: number; totalBytes: number }> {
    const meta = await this.loadUploadMeta(uploadId, user, bookingId);
    const redis = this.requireRedis();
    await redis.client.hset(this.uploadChunksKey(uploadId), String(index), chunk.toString('base64'));
    await redis.client.expire(this.uploadChunksKey(uploadId), CHAT_UPLOAD_SESSION_TTL_SECONDS);
    const receivedBytes = await this.sumChunkBytes(uploadId);
    return { receivedBytes, totalBytes: meta.totalBytes };
  }

  private async sumChunkBytes(uploadId: string): Promise<number> {
    const redis = this.requireRedis();
    const chunks = await redis.client.hgetall(this.uploadChunksKey(uploadId));
    return Object.values(chunks).reduce((sum, b64) => sum + Buffer.byteLength(b64, 'base64'), 0);
  }

  /** Progress + which chunk indexes already arrived, so a reconnecting client knows what's left to send. */
  async uploadProgress(user: AuthUser, bookingId: string, uploadId: string) {
    const meta = await this.loadUploadMeta(uploadId, user, bookingId);
    const redis = this.requireRedis();
    const chunks = await redis.client.hgetall(this.uploadChunksKey(uploadId));
    const receivedIndexes = Object.keys(chunks).map(Number).sort((a, b) => a - b);
    const receivedBytes = await this.sumChunkBytes(uploadId);
    return { receivedBytes, totalBytes: meta.totalBytes, receivedIndexes };
  }

  /** Abandons an in-progress upload (e.g. the user cancelled the attachment). */
  async abortUpload(user: AuthUser, bookingId: string, uploadId: string): Promise<{ ok: true }> {
    await this.loadUploadMeta(uploadId, user, bookingId);
    const redis = this.requireRedis();
    await redis.client.del(this.uploadMetaKey(uploadId), this.uploadChunksKey(uploadId));
    return { ok: true };
  }

  /**
   * Assembles every chunk in index order, uploads the result, creates the
   * chat message, and clears the Redis session. Requires a contiguous
   * 0..N run of indexes whose combined size matches the declared totalBytes.
   */
  async completeUpload(
    user: AuthUser,
    bookingId: string,
    uploadId: string,
    dto: CompleteChatUploadDto,
  ) {
    const booking = await this.bookingForParty(user, bookingId);
    this.assertBookingWritable(booking);
    const meta = await this.loadUploadMeta(uploadId, user, bookingId);
    const redis = this.requireRedis();
    const storage = this.requireStorage();
    const chunks = await redis.client.hgetall(this.uploadChunksKey(uploadId));
    const indexes = Object.keys(chunks).map(Number).sort((a, b) => a - b);
    if (indexes.length === 0 || indexes.some((idx, i) => idx !== i)) {
      throw new BadRequestException('Upload is incomplete: chunk indexes must be contiguous starting at 0');
    }
    const buffer = Buffer.concat(indexes.map((idx) => Buffer.from(chunks[String(idx)]!, 'base64')));
    if (buffer.length !== meta.totalBytes) {
      throw new BadRequestException(
        `Upload is incomplete: received ${buffer.length} of ${meta.totalBytes} bytes`,
      );
    }
    if (dto.replyToId) {
      await this.assertReplyTargetOnBooking(dto.replyToId, bookingId);
    }
    const stored = await storage.putChatMedia(`bookings/${bookingId}/media`, meta.filename, buffer, meta.mimeType);
    const message = await this.prisma.chatMessage.create({
      data: {
        bookingId,
        senderId: user.sub,
        type: messageTypeForMime(meta.mimeType),
        body: dto.body ?? null,
        mediaKey: stored.fileKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        replyToId: dto.replyToId ?? null,
      },
      include: this.messageInclude(),
    });
    await redis.client.del(this.uploadMetaKey(uploadId), this.uploadChunksKey(uploadId));
    await this.audit.log({
      actorId: user.sub,
      action: 'chat.message.sent',
      entityType: 'ChatMessage',
      entityId: message.id,
      metadata: { bookingId, type: message.type, sizeBytes: stored.sizeBytes },
    });
    const recipientId = user.sub === booking.customerId ? booking.caregiver.userId : booking.customerId;
    this.realtime?.entityUpdated(
      { users: [recipientId] },
      {
        type: 'chat_message',
        id: message.id,
        action: 'created',
        data: { bookingId, senderId: user.sub, type: message.type, replyToId: message.replyToId },
      },
    );
    return this.present(message);
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
    description: "Sends a message on this booking's chat thread; the other party is notified live. Read-only once the booking is not CONFIRMED (not yet confirmed, or completed/cancelled/declined).",
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

  @Patch(':messageId/read')
  @ApiOperation({
    summary: 'Mark one message as read',
    description: 'Per-message read receipt, e.g. as each message scrolls into view.',
  })
  markOneRead(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.chat.markOneRead(user, bookingId, messageId);
  }

  @Post(':messageId/reactions')
  @ApiOperation({
    summary: 'React to a message',
    description: 'Adds an emoji reaction; reacting again with the same emoji removes it.',
  })
  react(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: ReactToMessageDto,
  ) {
    return this.chat.react(user, bookingId, messageId, dto);
  }
}

@ApiTags('System & Notifications')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.CAREGIVER, UserRole.ADMIN)
@Controller('bookings/:bookingId/media/uploads')
export class ChatUploadsController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @ApiOperation({
    summary: 'Start a resumable attachment upload',
    description: 'Opens an upload session for an image, PDF, voice note, or short video. Validates type/size up front.',
  })
  init(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: InitChatUploadDto,
  ) {
    return this.chat.initUpload(user, bookingId, dto);
  }

  @Get(':uploadId')
  @ApiOperation({
    summary: 'Upload progress',
    description: 'Bytes received and which chunk indexes already arrived, so a reconnecting client knows what to send next.',
  })
  progress(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chat.uploadProgress(user, bookingId, uploadId);
  }

  @Put(':uploadId/chunks/:index')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload one chunk',
    description: 'Stores one chunk by index (idempotent: re-sending the same index just overwrites it, enabling pause/resume/retry).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['chunk'],
      properties: { chunk: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('chunk', { limits: { fileSize: 2 * 1024 * 1024 } }))
  putChunk(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Param('uploadId') uploadId: string,
    @Param('index', ParseIntPipe) index: number,
    @UploadedFile() file: { buffer: Buffer },
  ) {
    return this.chat.putChunk(user, bookingId, uploadId, index, file.buffer);
  }

  @Post(':uploadId/complete')
  @ApiOperation({
    summary: 'Finish the upload and send it as a message',
    description: 'Assembles the chunks, stores the attachment, and creates the chat message (optionally with a caption and/or a reply).',
  })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Param('uploadId') uploadId: string,
    @Body() dto: CompleteChatUploadDto,
  ) {
    return this.chat.completeUpload(user, bookingId, uploadId, dto);
  }

  @Delete(':uploadId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Abandon an in-progress upload',
    description: 'Cancels the attachment and clears its session.',
  })
  abort(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chat.abortUpload(user, bookingId, uploadId);
  }
}

@Module({
  controllers: [ChatController, ChatUploadsController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
