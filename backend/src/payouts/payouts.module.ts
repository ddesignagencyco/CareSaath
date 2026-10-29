import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  ConflictException,
  Module,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
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
import { RealtimeService } from '../realtime/realtime.service.js';
import { payoutReceiptDocument, payoutReceiptNumber } from '../receipts/receipt-data.js';
import type { ReceiptAudience } from '../receipts/receipt-data.js';
import { buildReceiptPdf } from '../receipts/receipt-pdf.js';
import { sendPdf } from '../receipts/send-pdf.js';
import type { PdfFile } from '../receipts/send-pdf.js';

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
  @ApiProperty({ enum: PayoutAccountType, example: PayoutAccountType.MOBILE_WALLET, description: 'Account type (BANK_ACCOUNT or MOBILE_WALLET)' })
  @IsEnum(PayoutAccountType)
  type!: PayoutAccountType;

  @ApiProperty({ example: 'JazzCash', description: 'Provider name (e.g. JazzCash, Easypaisa, Meezan Bank, HBL)' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  provider!: string;

  @ApiProperty({ example: 'Fatima Noor', description: 'Account title / legal account holder name' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  accountTitle!: string;

  @ApiProperty({ example: '03001110011', description: 'Account number or IBAN (stored encrypted at rest)' })
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

  @ApiPropertyOptional({ example: 'Easypaisa' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  provider?: string;

  @ApiPropertyOptional({ example: 'Fatima Noor' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  accountTitle?: string;

  @ApiPropertyOptional({ example: '03001110011' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  accountNumber?: string;
}

export class CreatePayoutRequestDto {
  @ApiProperty({ format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Saved payout account UUID' })
  @IsUUID()
  payoutAccountId!: string;

  @ApiProperty({ example: 48000, description: 'Withdrawal amount in paisa (e.g. 48000 = PKR 480)' })
  @IsInt()
  @Min(1)
  amount!: number;
}

export class ReportPayoutIssueDto {
  @ApiProperty({ example: 'Nothing has arrived in my JazzCash account yet.', description: 'What the caregiver sees' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note!: string;
}

export class ResolvePayoutDto {
  @ApiPropertyOptional({ example: 'TXN-2026-104455', description: 'Bank / wallet transfer reference the caregiver can look up (mark-transferred)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ example: 'Approved by admin', description: 'Rejection or settlement reason' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: 'Transferred via 1Link banking portal ref #TXN123456.', description: 'Settlement remarks / notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
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
  let masked: string | null = null;
  try {
    masked = maskAccountNumber(decryptAccountNumber(account.accountNumber));
  } catch {
    // Undecryptable (e.g. written under a different key): never fail the whole list.
  }
  return { ...account, accountNumber: masked };
}

export class ListPayoutRequestsQueryDto {
  @ApiPropertyOptional({ enum: PayoutStatus, description: 'Filter by payout status' })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

  @ApiPropertyOptional({ example: 'Fatima', description: 'Admin list only: search by caregiver name or phone' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  private payoutChanged(payoutId: string, caregiverUserId: string, action: string, status: string) {
    this.realtime?.entityUpdated(
      { users: [caregiverUserId], roles: ['ADMIN'] },
      { type: 'payout', id: payoutId, action, status },
    );
  }

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
      where: {
        payoutAccountId: id,
        status: { in: [PayoutStatus.REQUESTED, PayoutStatus.PROCESSING, PayoutStatus.TRANSFERRED] },
      },
    });
    if (inUse > 0) {
      throw new BadRequestException('Cannot remove an account with an in-progress payout');
    }
    try {
      await this.prisma.payoutAccount.delete({ where: { id } });
    } catch (err) {
      // P2003: foreign key violation — the account has payout history.
      if ((err as { code?: string }).code === 'P2003') {
        throw new ConflictException('This account has payout history and cannot be removed');
      }
      throw err;
    }
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
          payoutRequest: {
            status: { in: [PayoutStatus.REQUESTED, PayoutStatus.PROCESSING, PayoutStatus.TRANSFERRED] },
          },
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

    // Greedily attach whole settled payments until the requested amount is
    // covered. Payments are never split, so the last one can overshoot the
    // requested amount; the payout is locked (and will settle) for exactly what
    // it attaches, never for less, so no money is ever forfeited.
    const chosen: string[] = [];
    let lockedAmount = 0;
    for (const payment of eligible) {
      if (lockedAmount >= dto.amount) break;
      chosen.push(payment.id);
      lockedAmount += payment.caregiverAmount;
    }

    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payoutRequest.create({
        data: {
          caregiverId,
          payoutAccountId: dto.payoutAccountId,
          amount: lockedAmount,
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
      metadata: { requestedAmount: dto.amount, lockedAmount, payments: chosen.length },
    });
    await this.notifications.notifyAdmins({
      event: 'payout.requested',
      payload: { payoutRequestId: payout.id, amount: lockedAmount },
      message: `A caregiver requested a payout of Rs ${lockedAmount / 100}.`,
    });
    this.payoutChanged(payout.id, user.sub, 'requested', PayoutStatus.REQUESTED);
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
    const where: Prisma.PayoutRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            caregiver: {
              user: {
                OR: [
                  { fullName: { contains: query.q, mode: 'insensitive' } },
                  { phone: { contains: query.q } },
                ],
              },
            },
          }
        : {}),
    };
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
        payoutAccount: { select: { provider: true } },
      },
    });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }
    const allowed: Record<PayoutStatus, PayoutStatus[]> = {
      REQUESTED: [PayoutStatus.PROCESSING, PayoutStatus.REJECTED],
      PROCESSING: [PayoutStatus.TRANSFERRED, PayoutStatus.REJECTED],
      // The caregiver, not the admin, moves a transferred payout to PAID (confirmReceived).
      TRANSFERRED: [],
      PAID: [],
      REJECTED: [],
    };
    // After the caregiver reports the money missing, the admin may send it again.
    const retransfer =
      to === PayoutStatus.TRANSFERRED &&
      payout.status === PayoutStatus.TRANSFERRED &&
      payout.issueReportedAt !== null;
    if (!allowed[payout.status].includes(to) && !retransfer) {
      throw new BadRequestException(`Cannot move a payout from ${payout.status} to ${to}`);
    }
    if (to === PayoutStatus.REJECTED && !dto.reason) {
      throw new BadRequestException('A reason is required to reject a payout');
    }
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutRequest.update({
        where: { id },
        data: {
          status: to,
          ...(to === PayoutStatus.REJECTED ? { processedAt: new Date() } : {}),
          ...(to === PayoutStatus.TRANSFERRED
            ? {
                transferredAt: new Date(),
                transferReference: dto.reference ?? dto.note ?? null,
                issueReportedAt: null,
                issueNote: null,
              }
            : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          ...(to === PayoutStatus.REJECTED ? { rejectionReason: dto.reason } : {}),
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
    const detailed = await this.prisma.payoutRequest.findUniqueOrThrow({
      where: { id },
      include: {
        caregiver: {
          select: { id: true, specialty: true, user: { select: { fullName: true, phone: true } } },
        },
        payoutAccount: { select: PAYOUT_ACCOUNT_SELECT },
      },
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
      message:
        to === PayoutStatus.TRANSFERRED
          ? `Rs ${payout.amount / 100} was sent to your ${payout.payoutAccount?.provider ?? 'payout'} account${
              dto.reference ?? dto.note ? ` (ref ${dto.reference ?? dto.note})` : ''
            }. Please confirm once you have received it.`
          : `Your payout request is now ${to.replace(/_/g, ' ').toLowerCase()}.${
              to === PayoutStatus.REJECTED && dto.reason ? ` Reason: ${dto.reason}` : ''
            }`,
    });
    this.payoutChanged(id, payout.caregiver.userId, to.toLowerCase(), to);
    // Same shape as the admin list so clients can swap the row in place.
    return { ...detailed, payoutAccount: presentAccount(detailed.payoutAccount) };
  }

  approve(admin: AuthUser, id: string, dto: ResolvePayoutDto) {
    return this.resolve(admin, id, PayoutStatus.PROCESSING, dto);
  }

  /** Admin has sent the money; the payout waits for the caregiver to confirm receipt. */
  markTransferred(admin: AuthUser, id: string, dto: ResolvePayoutDto) {
    return this.resolve(admin, id, PayoutStatus.TRANSFERRED, dto);
  }

  /** @deprecated Same as markTransferred; a payout is only PAID after the caregiver confirms. */
  markPaid(admin: AuthUser, id: string, dto: ResolvePayoutDto) {
    return this.markTransferred(admin, id, dto);
  }

  reject(admin: AuthUser, id: string, dto: ResolvePayoutDto) {
    return this.resolve(admin, id, PayoutStatus.REJECTED, dto);
  }

  /**
   * PDF transfer receipt, available once the admin has sent the money
   * (TRANSFERRED) and after the caregiver has confirmed (PAID). The caregiver
   * named on the payout and admins can download it; the account number is masked.
   */
  async receipt(user: AuthUser, id: string): Promise<PdfFile> {
    const payout = await this.prisma.payoutRequest.findUnique({
      where: { id },
      include: {
        caregiver: { select: { userId: true, user: { select: { fullName: true, phone: true } } } },
        payoutAccount: { select: PAYOUT_ACCOUNT_SELECT },
      },
    });
    let audience: ReceiptAudience | null = null;
    if (payout) {
      if (user.role === UserRole.ADMIN) audience = 'admin';
      else if (user.role === UserRole.CAREGIVER && payout.caregiver.userId === user.sub) audience = 'caregiver';
    }
    if (!payout || !audience) {
      throw new NotFoundException('Payout request not found');
    }
    if (payout.status !== PayoutStatus.TRANSFERRED && payout.status !== PayoutStatus.PAID) {
      throw new BadRequestException('A transfer receipt is available once the payout has been sent');
    }
    const { accountNumber } = presentAccount(payout.payoutAccount);
    const pdf = await buildReceiptPdf(
      payoutReceiptDocument({ ...payout, maskedAccountNumber: accountNumber ?? '****' }, audience),
    );
    return { filename: `caresaath-transfer-${payoutReceiptNumber(payout)}.pdf`, pdf };
  }

  // ---- Caregiver side of the transfer check ---------------------------------

  private async ownTransferredPayout(user: AuthUser, id: string) {
    const caregiverId = await this.caregiverProfileId(user);
    const payout = await this.prisma.payoutRequest.findFirst({ where: { id, caregiverId } });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }
    return payout;
  }

  private async ownPayoutDetail(id: string) {
    const detail = await this.prisma.payoutRequest.findUniqueOrThrow({
      where: { id },
      include: { payoutAccount: { select: PAYOUT_ACCOUNT_SELECT } },
    });
    return { ...detail, payoutAccount: presentAccount(detail.payoutAccount) };
  }

  /**
   * The caregiver confirms the transferred money arrived. Only then is the payout
   * PAID (and counted as paid out). Confirming again is a no-op.
   */
  async confirmReceived(user: AuthUser, id: string) {
    const payout = await this.ownTransferredPayout(user, id);
    if (payout.status === PayoutStatus.PAID) {
      return this.ownPayoutDetail(id);
    }
    if (payout.status !== PayoutStatus.TRANSFERRED) {
      throw new BadRequestException(
        `Nothing to confirm yet: this payout is ${payout.status}, it must be TRANSFERRED by the admin first`,
      );
    }
    const now = new Date();
    await this.prisma.payoutRequest.update({
      where: { id },
      data: {
        status: PayoutStatus.PAID,
        caregiverConfirmedAt: now,
        processedAt: now,
        issueReportedAt: null,
        issueNote: null,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'payout_request.confirmed',
      entityType: 'PayoutRequest',
      entityId: id,
      metadata: { amount: payout.amount },
    });
    await this.notifications.notifyAdmins({
      event: 'payout.confirmed',
      payload: { payoutRequestId: id, amount: payout.amount },
      message: `The caregiver confirmed receiving the Rs ${payout.amount / 100} payout.`,
    });
    this.payoutChanged(id, user.sub, 'confirmed', PayoutStatus.PAID);
    return this.ownPayoutDetail(id);
  }

  /** The caregiver says the transferred money did not arrive; admins are alerted to resend or investigate. */
  async reportNotReceived(user: AuthUser, id: string, dto: ReportPayoutIssueDto) {
    const payout = await this.ownTransferredPayout(user, id);
    if (payout.status !== PayoutStatus.TRANSFERRED) {
      throw new BadRequestException(
        `Only a transferred payout can be reported as not received (this one is ${payout.status})`,
      );
    }
    await this.prisma.payoutRequest.update({
      where: { id },
      data: { issueReportedAt: new Date(), issueNote: dto.note },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'payout_request.issue_reported',
      entityType: 'PayoutRequest',
      entityId: id,
      metadata: { note: dto.note },
    });
    await this.notifications.notifyAdmins({
      event: 'payout.issue_reported',
      payload: { payoutRequestId: id, amount: payout.amount, note: dto.note },
      message: `A caregiver reports the Rs ${payout.amount / 100} payout has not arrived: ${dto.note}`,
    });
    this.payoutChanged(id, user.sub, 'issue_reported', PayoutStatus.TRANSFERRED);
    return this.ownPayoutDetail(id);
  }
}

@ApiTags('Caregiver - Payments & Payouts')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver/payout-accounts')
export class PayoutAccountsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  @ApiOperation({
    summary: 'List caregiver withdrawal accounts',
    description: 'Retrieves saved bank accounts and mobile wallets with masked account numbers.',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.payouts.listAccounts(user);
  }

  @Post()
  @ApiOperation({
    summary: 'Register withdrawal account',
    description: 'Adds a bank account or mobile wallet for payouts. Account number is encrypted at rest.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePayoutAccountDto) {
    return this.payouts.createAccount(user, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update withdrawal account',
    description: 'Updates provider or account title for a withdrawal account.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayoutAccountDto,
  ) {
    return this.payouts.updateAccount(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete withdrawal account',
    description: 'Removes a withdrawal account if not referenced by active pending payouts.',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.deleteAccount(user, id);
  }
}

@ApiTags('Caregiver - Payments & Payouts')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver')
export class CaregiverPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('earnings')
  @ApiOperation({
    summary: 'Caregiver earnings summary',
    description: 'Returns available balance, settled earnings, pending payouts, and lifetime earnings.',
  })
  earnings(@CurrentUser() user: AuthUser) {
    return this.payouts.earnings(user);
  }

  @Get('payouts')
  @ApiOperation({
    summary: 'List caregiver withdrawal requests',
    description: 'Lists withdrawal requests submitted by the caregiver with status.',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListPayoutRequestsQueryDto) {
    return this.payouts.listPayoutRequests(user, query);
  }

  @Get('payouts/:id/receipt')
  @ApiOperation({
    summary: 'Download the transfer receipt (PDF)',
    description: 'PDF receipt for a payout the admin has sent (TRANSFERRED or PAID), with the masked account number and transfer reference. ?inline=true views it in the browser.',
  })
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('inline') inline?: string,
  ) {
    sendPdf(res, await this.payouts.receipt(user, id), inline === 'true');
  }

  @Post('payouts/:id/confirm-received')
  @ApiOperation({
    summary: 'Confirm a transferred payout arrived',
    description:
      'Caregiver side of the transfer check. After the admin marks a payout TRANSFERRED, confirm here once the money is in your account; only then does it become PAID. Idempotent.',
  })
  confirmReceived(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payouts.confirmReceived(user, id);
  }

  @Post('payouts/:id/report-not-received')
  @ApiOperation({
    summary: 'Report a transferred payout as not received',
    description:
      'Tell the admins a TRANSFERRED payout has not arrived. The payout stays TRANSFERRED with the issue recorded; the admin can then resend it (mark-transferred again) or investigate.',
  })
  reportNotReceived(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportPayoutIssueDto,
  ) {
    return this.payouts.reportNotReceived(user, id, dto);
  }

  @Post('payouts')
  @ApiOperation({
    summary: 'Request earnings payout',
    description: 'Submits a withdrawal request against available balance to a registered payout account.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePayoutRequestDto) {
    return this.payouts.createPayoutRequest(user, dto);
  }
}

@ApiTags('Admin - Finance & Payouts')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all caregiver payout requests',
    description: 'Admin view of withdrawal requests across all caregivers with status filtering. Search by caregiver name or phone with ?q=.',
  })
  list(@Query() query: ListPayoutRequestsQueryDto) {
    return this.payouts.listAll(query);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve payout request',
    description: 'Admin approves a caregiver payout request for processing.',
  })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePayoutDto,
  ) {
    return this.payouts.approve(user, id, dto);
  }

  @Get(':id/receipt')
  @ApiOperation({
    summary: 'Download a payout transfer receipt (PDF)',
    description: 'Admin copy of the transfer receipt for a payout that has been sent (TRANSFERRED or PAID). ?inline=true views it in the browser.',
  })
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('inline') inline?: string,
  ) {
    sendPdf(res, await this.payouts.receipt(user, id), inline === 'true');
  }

  @Post(':id/mark-transferred')
  @ApiOperation({
    summary: 'Mark payout as transferred',
    description:
      'Admin records that the funds were sent to the caregiver (optionally with a transfer reference). The caregiver is notified and must confirm receipt; only then is the payout PAID. If the caregiver reported it missing, call this again to resend.',
  })
  markTransferred(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePayoutDto,
  ) {
    return this.payouts.markTransferred(user, id, dto);
  }

  @Post(':id/mark-paid')
  @ApiOperation({
    summary: 'Mark payout as transferred (deprecated alias)',
    description: 'Deprecated: identical to mark-transferred. The payout becomes TRANSFERRED, and PAID only after the caregiver confirms receipt.',
  })
  markPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePayoutDto,
  ) {
    return this.payouts.markPaid(user, id, dto);
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Reject payout request',
    description: 'Admin rejects a payout request with a reason and refunds the available balance.',
  })
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
