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
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDecimal, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class AddressDto {
  @ApiPropertyOptional({ example: 'Home', description: 'Label for address (e.g. Home, Office)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiProperty({ example: '12 Gulberg III, Main Boulevard', description: 'Street address line' })
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  addressLine!: string;

  @ApiProperty({ example: 'Lahore', description: 'City name' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @ApiProperty({ example: '31.516300', description: 'Latitude decimal coordinate' })
  @IsDecimal({ decimal_digits: '1,8' })
  latitude!: string;

  @ApiProperty({ example: '74.345200', description: 'Longitude decimal coordinate' })
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
    const created = await this.prisma.address.create({
      data: {
        userId: user.sub,
        label: dto.label,
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
      entityId: created.id,
    });
    return created;
  }

  async update(user: AuthUser, id: string, dto: AddressDto) {
    await this.get(user, id);
    const updated = await this.prisma.address.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
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
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    const bookingCount = await this.prisma.booking.count({ where: { addressId: id } });
    if (bookingCount > 0) {
      throw new NotFoundException(
        'Address is referenced by existing bookings and cannot be deleted',
      );
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

@ApiTags('Customer - Addresses')
@ApiBearerAuth()
@Controller('customer/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({
    summary: 'List saved addresses',
    description: 'Retrieves all saved service delivery addresses for the customer.',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.addresses.list(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get address by ID',
    description: 'Retrieves details for a single saved address.',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.addresses.get(user, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a new service address',
    description: 'Saves a new home or office address with latitude and longitude coordinates.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    return this.addresses.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update saved address',
    description: 'Modifies address line, city, or coordinates of an existing address.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddressDto,
  ) {
    return this.addresses.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete saved address',
    description: 'Removes an address if not referenced by active or past bookings.',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.addresses.remove(user, id);
  }
}

@Module({
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class AddressesModule {}
