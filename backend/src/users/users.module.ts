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
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Language } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;
}

class EmergencyContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  phone!: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMe(user: AuthUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        phone: true,
        role: true,
        fullName: true,
        preferredLanguage: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        caregiverProfile: { select: { id: true, verificationStatus: true } },
      },
    });
    if (!record) {
      throw new NotFoundException('User not found');
    }
    return record;
  }

  async updateMe(user: AuthUser, dto: UpdateProfileDto) {
    const updated = await this.prisma.user.update({
      where: { id: user.sub },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.preferredLanguage !== undefined
          ? { preferredLanguage: dto.preferredLanguage }
          : {}),
      },
      select: { id: true, phone: true, fullName: true, preferredLanguage: true },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'user.profile.updated',
      entityType: 'User',
      entityId: user.sub,
    });
    return updated;
  }

  async listEmergencyContacts(user: AuthUser) {
    return this.prisma.emergencyContact.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addEmergencyContact(user: AuthUser, dto: EmergencyContactDto) {
    const contact = await this.prisma.emergencyContact.create({
      data: { userId: user.sub, name: dto.name, phone: dto.phone },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'user.emergency_contact.added',
      entityType: 'EmergencyContact',
      entityId: contact.id,
    });
    return contact;
  }

  async removeEmergencyContact(user: AuthUser, id: string) {
    const contact = await this.prisma.emergencyContact.findFirst({
      where: { id, userId: user.sub },
    });
    if (!contact) {
      throw new NotFoundException('Emergency contact not found');
    }
    await this.prisma.emergencyContact.delete({ where: { id } });
    return { ok: true as const };
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('customer')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(user, dto);
  }

  @Get('emergency-contacts')
  listContacts(@CurrentUser() user: AuthUser) {
    return this.users.listEmergencyContacts(user);
  }

  @Post('emergency-contacts')
  addContact(@CurrentUser() user: AuthUser, @Body() dto: EmergencyContactDto) {
    return this.users.addEmergencyContact(user, dto);
  }

  @Delete('emergency-contacts/:id')
  removeContact(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.removeEmergencyContact(user, id);
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
