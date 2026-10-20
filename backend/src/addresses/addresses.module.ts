import {
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
} from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDecimal, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

class AddressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(240)
  addressLine!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @Type(() => Number)
  @IsDecimal({ decimal_digits: '1,8' })
  latitude!: string;

  @Type(() => Number)
  @IsDecimal({ decimal_digits: '1,8' })
  longitude!: string;
}

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.address.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const address = await this.prisma.address.findFirst({
      where: { id, userId: user.sub },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  async create(user: AuthUser, dto: AddressDto) {
    const address = await this.prisma.address.create({
      data: {
        userId: user.sub,
        label: dto.label ?? null,
        addressLine: dto.addressLine,
        city: dto.city,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'address.created',
      entityType: 'Address',
      entityId: address.id,
    });
    return address;
  }

  async update(user: AuthUser, id: string, dto: AddressDto) {
    await this.get(user, id);
    const address = await this.prisma.address.update({
      where: { id },
      data: {
        label: dto.label ?? null,
        addressLine: dto.addressLine,
        city: dto.city,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'address.updated',
      entityType: 'Address',
      entityId: id,
    });
    return address;
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    const bookings = await this.prisma.booking.count({ where: { addressId: id } });
    if (bookings > 0) {
      throw new NotFoundException('Address is referenced by bookings and cannot be deleted');
    }
    await this.prisma.address.delete({ where: { id } });
    await this.audit.log({
      actorId: user.sub,
      action: 'address.deleted',
      entityType: 'Address',
      entityId: id,
    });
    return { ok: true as const };
  }
}

@ApiTags('addresses')
@ApiBearerAuth()
@Controller('customer/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.addresses.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.addresses.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    return this.addresses.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddressDto,
  ) {
    return this.addresses.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.addresses.remove(user, id);
  }
}

@Module({
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class AddressesModule {}
