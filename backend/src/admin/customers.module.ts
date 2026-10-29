import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Prisma, UserRole, UserStatus } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class ListCustomersQueryDto {
  @ApiPropertyOptional({ example: 'Ayesha', description: 'Search by name, phone, or email' })
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

export class DeactivateCustomerDto {
  @ApiPropertyOptional({ example: 'Requested account deletion', description: 'Admin note' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

const CUSTOMER_SELECT = {
  id: true,
  phone: true,
  email: true,
  fullName: true,
  status: true,
  preferredLanguage: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** Admin read/manage access to customer accounts (FR: operator support tooling). */
@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListCustomersQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.UserWhereInput = {
      role: UserRole.CUSTOMER,
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: CUSTOMER_SELECT,
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  private async load(id: string) {
    const customer = await this.prisma.user.findFirst({
      where: { id, role: UserRole.CUSTOMER },
      select: CUSTOMER_SELECT,
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  /** Profile plus a booking summary, so support doesn't need a separate bookings browser just to look someone up. */
  async get(id: string) {
    const customer = await this.load(id);
    const [bookingsTotal, recentBookings] = await Promise.all([
      this.prisma.booking.count({ where: { customerId: id } }),
      this.prisma.booking.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          serviceType: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          caregiver: { select: { id: true, user: { select: { fullName: true } } } },
        },
      }),
    ]);
    return { ...customer, bookingsTotal, recentBookings };
  }

  async deactivate(admin: AuthUser, id: string, dto: DeactivateCustomerDto) {
    await this.load(id);
    await this.prisma.user.update({ where: { id }, data: { status: UserStatus.DEACTIVATED } });
    await this.audit.log({
      actorId: admin.sub,
      action: 'customer.deactivated',
      entityType: 'User',
      entityId: id,
      metadata: { reason: dto.reason ?? null },
    });
    return this.load(id);
  }

  async reactivate(admin: AuthUser, id: string) {
    await this.load(id);
    await this.prisma.user.update({ where: { id }, data: { status: UserStatus.ACTIVE } });
    await this.audit.log({
      actorId: admin.sub,
      action: 'customer.reactivated',
      entityType: 'User',
      entityId: id,
    });
    return this.load(id);
  }
}

@ApiTags('Admin - Users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  @Get()
  @ApiOperation({
    summary: 'Search customer accounts',
    description: 'Lists customer accounts, searchable by name, phone, or email with ?q=.',
  })
  list(@Query() query: ListCustomersQueryDto) {
    return this.customers.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'View a customer',
    description: 'Profile plus a summary of their recent bookings.',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.get(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a customer account',
    description: 'Blocks the account from logging in (status DEACTIVATED). Use reactivate to restore.',
  })
  deactivate(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeactivateCustomerDto,
  ) {
    return this.customers.deactivate(admin, id, dto);
  }

  @Post(':id/reactivate')
  @ApiOperation({
    summary: 'Reactivate a customer account',
    description: 'Restores a deactivated customer account to ACTIVE.',
  })
  reactivate(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.reactivate(admin, id);
  }
}

@Module({
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService],
  exports: [AdminCustomersService],
})
export class AdminCustomersModule {}
