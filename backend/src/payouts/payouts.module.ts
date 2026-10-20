import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  PaymentStatus,
  PayoutAccountType,
  PayoutStatus,
  Prisma,
  UserRole,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import {
  decryptField,
  deriveKey,
  encryptField,
} from '../common/crypto/field-encryption.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';

/**
 * ERD §3.5 / TRD §9: payout account numbers are sensitive and must be encrypted
 * at rest (AES-256-GCM, shared field-encryption utility).
 */
const ENC_KEY = deriveKey('PAYOUT_ENCRYPTION_KEY', 'caresaath-dev-payout-key');

export function encryptAccountNumber(plain: string): string {
  return encryptField(plain, ENC_KEY);
}

export function decryptAccountNumber(stored: string): string {
  return decryptField(stored, ENC_KEY);
}

/** Last four digits only, for display. */
export function maskAccountNumber(accountNumber: string): string {
  return `****${accountNumber.slice(-4)}`;
}

export class CreatePayoutAccountDto {
  @ApiProperty({ enum: PayoutAccountType })
  @IsEnum(PayoutAccountType)
  type!: PayoutAccountType;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  provider!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  accountTitle!: string;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  accountNumber!: string;
}

export class UpdatePayoutAccountDto {
  @ApiPropertyOptional({ enum: PayoutAccountType })
  @IsOptional()
  @IsEnum(PayoutAccountType)
  type?: PayoutAccountType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  accountTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  accountNumber?: string;
}

export class CreatePayoutRequestDto {
  @ApiProperty()
  @IsString()
  payoutAccountId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  amount!: number;
}

export class ListPayoutRequestsQueryDto {
  @ApiPropertyOptional({ enum: PayoutStatus })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

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

export class ResolvePayoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

const PAYOUT_ACCOUNT_SELECT = {
  id: true,
  caregiverId: true,
  type: true,
  provider: true,
  accountTitle: true,
  accountNumber: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PayoutAccountSelect;

function presentAccount<T extends { accountNumber: string }>(account: T) {
  return { ...account, accountNumber: maskAccountNumber(decryptAccountNumber(account.accountNumber)) };
}

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async caregiverProfileId(user: AuthUser): Promise<string> {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    return profile.id;
  }

  // ---- Payout accounts (FR-CG9) -------------------------------------------

  async listAccounts(user: AuthUser) {
    const caregiverId = await this.caregiverProfileId(user);
    const accounts = await this.prisma.payoutAccount.findMany({
      where: { caregiverId },
      orderBy: { createdAt: 'desc' },
      select: PAYOUT_ACCOUNT_SELECT,
    });
    return accounts.map(presentAccount);
  }

  async createAccount(user: AuthUser, dto: CreatePayoutAccountDto) {
    const caregiverId = await this.caregiverProfileId(user);
    const account = await this.prisma.payoutAccount.create({
      data: {
        caregiverId,
        type: dto.type,
        provider: dto.provider,
        accountTitle: dto.accountTitle,
        accountNumber: encryptAccountNumber(dto.accountNumber),
      },
      select: PAYOUT_ACCOUNT_SELECT,
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'payout_account.created',
      entityType: 'PayoutAccount',
      entityId: account.id,
      metadata: { type: dto.type, provider: dto.provider },
    });
    return presentAccount(account);
  }

  async updateAccount(user: AuthUser, id: string, dto: UpdatePayoutAccountDto) {
    const caregiverId = await this.caregiverProfileId(user);
    const existing = await this.prisma.payoutAccount.findFirst({
      where: { id, caregiverId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Payout account not found');
    }
    const updated = await this.prisma.payoutAccount.update({
      where: { id },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.provider ? { provider: dto.provider } : {}),
        ...(dto.accountTitle ? { accountTitle: dto.accountTitle } : {}),
        ...(dto.accountNumber ? { accountNumber: encryptAccountNumber(dto.accountNumber) } : {}),
      },
      select: PAYOUT_ACCOUNT_SELECT,
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'payout_account.updated',
      entityType: 'PayoutAccount',
      entityId: id,
    });
    return presentAccount(updated);
  }

  async deleteAccount(user: AuthUser, id: string) {
    const caregiverId = await this.caregiverProfileId(user);
    const existing = await this.prisma.payoutAccount.findFirst({
      where: { id, caregiverId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Payout account not found');
    }
    const inUse = await this.prisma.payoutRequest.count({
      where: { payoutAccountId: id, status: { in: [PayoutStatus.REQUESTED, PayoutStatus.PROCESSING] } },
    });
    if (inUse > 0) {
      throw new BadRequestException('Cannot remove an account with an in-progress payout');
    }
    await this.prisma.payoutAccount.delete({ where: { id } });
    await this.audit.log({
      actorId: user.sub,
      action: 'payout_account.deleted',
      entityType: 'PayoutAccount',
      entityId: id,
    });
    return { ok: true };
  }

  // ---- Earnings & payouts (FR-CG9) -----------------------------------------

  /**
   * Earnings come from settled payments: "available" = paid and not yet tied to
   * a payout request; "pending" = tied to a REQUESTED/PROCESSING payout.
   */
  async earnings(user: AuthUser) {
    const caregiverId = await this.caregiverProfileId(user);
    const [availableAgg, pendingAgg, paidAgg, requests] = await this.prisma.$transaction([
      this.prisma.payment.aggregate({
        where: {
          visit: { booking: { caregiverId } },
          status: PaymentStatus.PAID,
          payoutRequestId: null,
        },
        _sum: { caregiverAmount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          visit: { booking: { caregiverId } },
          status: PaymentStatus.PAID,
          payoutRequest: { status: { in: [PayoutStatus.REQUESTED, PayoutStatus.PROCESSING] } },
        },
        _sum: { caregiverAmount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: { visit: { booking: { caregiverId } }, status: PaymentStatus.PAID },
        _sum: { caregiverAmount: true, commissionAmount: true },
        _count: { _all: true },
      }),
      this.prisma.payoutRequest.findMany({
        where: { caregiverId },
        orderBy: { requestedAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      availableAmount: availableAgg._sum.caregiverAmount ?? 0,
      availableCount: availableAgg._count._all,
      pendingAmount: pendingAgg._sum.caregiverAmount ?? 0,
      pendingCount: pendingAgg._count._all,
      lifetimeEarnings: paidAgg._sum.caregiverAmount ?? 0,
      lifetimeCommission: paidAgg._sum.commissionAmount ?? 0,
      lifetimeVisits: paidAgg._count._all,
      recentPayoutRequests: requests,
    };
  }

  async createPayoutRequest(user: AuthUser, dto: CreatePayoutRequestDto) {
    const caregiverId = await this.caregiverProfileId(user);
    const account = await this.prisma.payoutAccount.findFirst({
      where: { id: dto.payoutAccountId, caregiverId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Payout account not found');
    }
    const eligible = await this.prisma.payment.findMany({
      where: {
        visit: { booking: { caregiverId } },
        status: PaymentStatus.PAID,
        payoutRequestId: null,
      },
      select: { id: true, caregiverAmount: true },
      orderBy: { paidAt: 'asc' },
    });
    const available = eligible.reduce((sum, p) => sum + p.caregiverAmount, 0);
    if (dto.amount > available) {
      throw new BadRequestException(`Requested amount exceeds available earnings (${available})`);
    }

    // Greedily attach settled payments until the requested amount is covered.
    const chosen: string[] = [];
    let running = 0;
    for (const payment of eligible) {
      if (running >= dto.amount) break;
      chosen.push(payment.id);
      running += payment.caregiverAmount;
    }

    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payoutRequest.create({
        data: {
          caregiverId,
          payoutAccountId: dto.payoutAccountId,
          amount: dto.amount,
          status: PayoutStatus.REQUESTED,
        },
      });
      if (chosen.length > 0) {
        await tx.payment.updateMany({
          where: { id: { in: chosen } },
          data: { payoutRequestId: created.id },
        });
      }
      return created;
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'payout_request.created',
      entityType: 'PayoutRequest',
      entityId: payout.id,
      metadata: { amount: dto.amount, payments: chosen.length },
    });
    return payout;
  }

  async listPayoutRequests(user: AuthUser, query: ListPayoutRequestsQueryDto): Promise<Paginated<unknown>> {
    const caregiverId = await this.caregiverProfileId(user);
    const where: Prisma.PayoutRequestWhereInput = {
      caregiverId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.payoutRequest.count({ where }),
      this.prisma.payoutRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { payoutAccount: { select: PAYOUT_ACCOUNT_SELECT } },
      }),
    ]);
    const presented = items.map((item) => ({
      ...item,
      payoutAccount: presentAccount(item.payoutAccount),
    }));
    return paginate(presented, query.page, query.limit, total);
  }

  // ---- Admin payout resolution --------------------------------------------

  async listAll(query: ListPayoutRequestsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.PayoutRequestWhereInput = query.status ? { status: query.status } : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.payoutRequest.count({ where }),
      this.prisma.payoutRequest.findMany({
        where,
        orderBy: { requestedAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          caregiver: {
            select: { id: true, specialty: true, user: { select: { fullName: true, phone: true } } },
          },
          payoutAccount: { select: PAYOUT_ACCOUNT_SELECT },
        },
      }),
    ]);
    const presented = items.map((item) => ({
      ...item,
      payoutAccount: presentAccount(item.payoutAccount),
    }));
    return paginate(presented, query.page, query.limit, total);
  }

  private async resolve(
    admin: AuthUser,
    id: string,
    to: PayoutStatus,
    dto: ResolvePayoutDto,
  ) {
    const payout = await this.prisma.payoutRequest.findUnique({
      where: { id },
      include: {
        caregiver: { select: { userId: true, user: { select: { phone: true } } } },
      },
    });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }
    const allowed: Record<PayoutStatus, PayoutStatus[]> = {
      REQUESTED: [PayoutStatus.PROCESSING, PayoutStatus.REJECTED],
      PROCESSING: [PayoutStatus.PAID, PayoutStatus.REJECTED],
      PAID: [],
      REJECTED: [],
    };
    if (!allowed[payout.status].includes(to)) {
      throw new BadRequestException(`Cannot move a payout from ${payout.status} to ${to}`);
    }
    if (to === PayoutStatus.REJECTED && !dto.reason) {
      throw new BadRequestException('A reason is required to reject a payout');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutRequest.update({
        where: { id },
        data: {
          status: to,
          processedAt: to === PayoutStatus.PAID || to === PayoutStatus.REJECTED ? new Date() : null,
        },
      });
      // Releasing a rejected payout frees its payments for a new request.
      if (to === PayoutStatus.REJECTED) {
        await tx.payment.updateMany({
          where: { payoutRequestId: id },
          data: { payoutRequestId: null },
        });
      }
      return result;
    });
    await this.audit.log({
      actorId: admin.sub,
      action: `payout_request.${to.toLowerCase()}`,
      entityType: 'PayoutRequest',
      entityId: id,
      metadata: dto.reason ? { reason: dto.reason } : undefined,
    });
    await this.notifications.notify({
      userId: payout.caregiver.userId,
      phone: payout.caregiver.user.phone,
      event: `payout.${to.toLowerCase()}`,
      payload: { payoutRequestId: id, amount: payout.amount, status: to },
      message: `Your payout request is now ${to.replace(/_/g, ' ').toLowerCase()}.`,
    });
    return updated;
  }

  approve(admin: AuthUser, id: string, dto: ResolvePayoutDto) {
    return this.resolve(admin, id, PayoutStatus.PROCESSING, dto);
  }

  markPaid(admin: AuthUser, id: string, dto: ResolvePayoutDto) {
    return this.resolve(admin, id, PayoutStatus.PAID, dto);
  }

  reject(admin: AuthUser, id: string, dto: ResolvePayoutDto) {
    return this.resolve(admin, id, PayoutStatus.REJECTED, dto);
  }
}

@ApiTags('caregiver-payouts')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver/payout-accounts')
export class PayoutAccountsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.payouts.listAccounts(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePayoutAccountDto) {
    return this.payouts.createAccount(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayoutAccountDto,
  ) {
    return this.payouts.updateAccount(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.deleteAccount(user, id);
  }
}

@ApiTags('caregiver-payouts')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver')
export class CaregiverPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('earnings')
  earnings(@CurrentUser() user: AuthUser) {
    return this.payouts.earnings(user);
  }

  @Get('payouts')
  list(@CurrentUser() user: AuthUser, @Query() query: ListPayoutRequestsQueryDto) {
    return this.payouts.listPayoutRequests(user, query);
  }

  @Post('payouts')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePayoutRequestDto) {
    return this.payouts.createPayoutRequest(user, dto);
  }
}

@ApiTags('admin-payouts')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  list(@Query() query: ListPayoutRequestsQueryDto) {
    return this.payouts.listAll(query);
  }

  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePayoutDto,
  ) {
    return this.payouts.approve(user, id, dto);
  }

  @Post(':id/mark-paid')
  markPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePayoutDto,
  ) {
    return this.payouts.markPaid(user, id, dto);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePayoutDto,
  ) {
    return this.payouts.reject(user, id, dto);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [
    PayoutAccountsController,
    CaregiverPayoutsController,
    AdminPayoutsController,
  ],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
