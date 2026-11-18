import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Language, UserRole, UserStatus } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { StorageService } from '../common/storage/storage.module.js';
import { EmailModule } from '../email/email.module.js';
import { EmailService } from '../email/email.service.js';
import { renderWelcomeEmail } from '../email/templates.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { RequestPhoneChangeDto, VerifyPhoneChangeDto } from '../auth/dto/auth.dto.js';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ayesha Khan', description: 'User full display name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ enum: Language, example: Language.EN, description: 'Preferred application language (EN / UR)' })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;

  @ApiPropertyOptional({ example: 'ayesha@example.com', description: 'Email for account updates (booking, payment, verification notifications)' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class EmergencyContactDto {
  @ApiProperty({ example: 'Hamza Khan (spouse)', description: 'Contact name and relationship' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '+923002220001', description: 'Emergency phone number' })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'phone must be a valid phone number (e.g. +923001234567)',
  })
  phone!: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
    private readonly email?: EmailService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  async getMe(user: AuthUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        fullName: true,
        photoKey: true,
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
    const { photoKey, ...profile } = record;
    return { ...profile, photoUrl: await this.photoUrlFor(photoKey) };
  }

  /** Public delivery URL for a stored photo key, or null when none was uploaded. */
  private async photoUrlFor(photoKey: string | null): Promise<string | null> {
    return photoKey ? this.storage.presignedGet(photoKey) : null;
  }

  /** Photo key for a user, falling back to the caregiver profile for photos uploaded before User.photoKey existed. */
  private async userPhotoKey(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { photoKey: true, caregiverProfile: { select: { photoKey: true } } },
    });
    return user?.photoKey ?? user?.caregiverProfile?.photoKey ?? null;
  }

  async photoUrl(user: AuthUser) {
    const photoKey = await this.userPhotoKey(user.sub);
    if (!photoKey) {
      throw new NotFoundException('No photo uploaded');
    }
    return { url: await this.storage.presignedGet(photoKey) };
  }

  /** Delivery URL for the public avatar route; null means the user has no photo. */
  async publicPhotoUrl(userId: string): Promise<string | null> {
    const photoKey = await this.userPhotoKey(userId);
    return photoKey ? this.storage.presignedGet(photoKey) : null;
  }

  async uploadPhoto(
    user: AuthUser,
    file?: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('No photo uploaded');
    }
    this.storage.validateImageUpload(file.mimetype, file.buffer.length);
    const stored = await this.storage.put(
      `users/${user.sub}/photo`,
      file.originalname,
      file.buffer,
      file.mimetype,
    );
    // Keep the caregiver profile in sync so the public caregiver APIs show the same portrait.
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.sub }, data: { photoKey: stored.fileKey } }),
      this.prisma.caregiverProfile.updateMany({
        where: { userId: user.sub },
        data: { photoKey: stored.fileKey },
      }),
    ]);
    await this.audit.log({
      actorId: user.sub,
      action: 'user.photo.updated',
      entityType: 'User',
      entityId: user.sub,
    });
    return { photoKey: stored.fileKey, photoUrl: await this.storage.presignedGet(stored.fileKey) };
  }

  async removePhoto(user: AuthUser) {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.sub }, data: { photoKey: null } }),
      this.prisma.caregiverProfile.updateMany({
        where: { userId: user.sub },
        data: { photoKey: null },
      }),
    ]);
    await this.audit.log({
      actorId: user.sub,
      action: 'user.photo.removed',
      entityType: 'User',
      entityId: user.sub,
    });
    return { ok: true as const };
  }

  async updateMe(user: AuthUser, dto: UpdateProfileDto) {
    const before =
      dto.email !== undefined
        ? await this.prisma.user.findUnique({ where: { id: user.sub }, select: { email: true } })
        : null;
    let updated;
    try {
      updated = await this.prisma.user.update({
        where: { id: user.sub },
        data: {
          ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
          ...(dto.preferredLanguage !== undefined
            ? { preferredLanguage: dto.preferredLanguage }
            : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
        },
        select: { id: true, phone: true, email: true, fullName: true, preferredLanguage: true, role: true },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Email already in use');
      }
      throw err;
    }
    await this.audit.log({
      actorId: user.sub,
      action: 'user.profile.updated',
      entityType: 'User',
      entityId: user.sub,
    });
    this.realtime?.entityUpdated(
      { users: [user.sub], roles: [UserRole.CUSTOMER, UserRole.CAREGIVER, UserRole.ADMIN] },
      { type: 'user', id: user.sub, action: 'profile_updated' },
    );
    // First time this account gets an email on file: welcome them there too.
    if (dto.email && !before?.email && updated.email) {
      this.email
        ?.sendEmail(
          updated.email,
          'Welcome to CareSaath',
          renderWelcomeEmail({ name: updated.fullName, role: updated.role }),
        )
        .catch(() => {
          // Never fail the profile update over a welcome email.
        });
    }
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

  /** Phone is the login identity; starts the CHANGE_PHONE OTP flow to the new number. */
  requestPhoneChange(user: AuthUser, dto: RequestPhoneChangeDto) {
    return this.auth.requestPhoneChange(user.sub, dto.newPhone);
  }

  async verifyPhoneChange(user: AuthUser, dto: VerifyPhoneChangeDto) {
    const { phone } = await this.auth.verifyPhoneChange(user.sub, dto.code);
    await this.audit.log({
      actorId: user.sub,
      action: 'user.phone_changed',
      entityType: 'User',
      entityId: user.sub,
    });
    return { phone };
  }

  /** Self-service deactivation (privacy / right-to-erasure): the account stops being able to log in. */
  async deactivateSelf(user: AuthUser) {
    await this.prisma.user.update({
      where: { id: user.sub },
      data: { status: UserStatus.DEACTIVATED },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'user.self_deactivated',
      entityType: 'User',
      entityId: user.sub,
    });
    return { ok: true as const };
  }
}

@ApiTags('Customer - Profile')
@ApiBearerAuth()
@Controller('customer')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieves profile, role, language preference, and caregiver onboarding status.',
  })
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Updates full name and preferred language (EN or UR).',
  })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(user, dto);
  }

  @Post('me/photo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload profile photo',
    description: 'Uploads a profile photo for any role (customer, caregiver or admin). JPEG, PNG or WEBP up to 10MB.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Profile photo file' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadPhoto(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    return this.users.uploadPhoto(user, file);
  }

  @Delete('me/photo')
  @ApiOperation({
    summary: 'Remove profile photo',
    description: 'Clears the profile photo so the avatar falls back to initials.',
  })
  removePhoto(@CurrentUser() user: AuthUser) {
    return this.users.removePhoto(user);
  }

  @Get('me/photo/url')
  @ApiOperation({
    summary: 'Get profile photo URL',
    description: 'Returns a viewable URL for the current user profile photo.',
  })
  photoUrl(@CurrentUser() user: AuthUser) {
    return this.users.photoUrl(user);
  }

  /**
   * Public avatar source used by <img> tags across the app. Redirects to the
   * Cloudinary delivery URL; users without a photo get 404 and the client shows initials.
   */
  @Public()
  @Get(':userId/photo')
  @ApiOperation({
    summary: 'Public profile photo by user id',
    description: 'Redirects to the user profile photo. Returns 404 when the user has no photo.',
  })
  async publicPhoto(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Res() res: Response,
  ) {
    const url = await this.users.publicPhotoUrl(userId);
    if (!url) {
      throw new NotFoundException('No photo uploaded');
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.redirect(302, url);
  }

  @Post('me/deactivate')
  @ApiOperation({
    summary: 'Deactivate my account',
    description: 'Self-service account deactivation (privacy / right-to-erasure). Blocks further logins; contact support to reactivate.',
  })
  deactivateSelf(@CurrentUser() user: AuthUser) {
    return this.users.deactivateSelf(user);
  }

  @Post('me/phone/request')
  @ApiOperation({
    summary: 'Start a phone number change',
    description: 'Sends a CHANGE_PHONE OTP to the new number. 409 if that number already belongs to another account.',
  })
  requestPhoneChange(@CurrentUser() user: AuthUser, @Body() dto: RequestPhoneChangeDto) {
    return this.users.requestPhoneChange(user, dto);
  }

  @Post('me/phone/verify')
  @ApiOperation({
    summary: 'Complete a phone number change',
    description: 'Verifies the CHANGE_PHONE OTP sent to the new number and moves the account to it.',
  })
  verifyPhoneChange(@CurrentUser() user: AuthUser, @Body() dto: VerifyPhoneChangeDto) {
    return this.users.verifyPhoneChange(user, dto);
  }

  @Roles('CUSTOMER')
  @Get('emergency-contacts')
  @ApiOperation({
    summary: 'List emergency contacts',
    description: 'Retrieves all emergency contacts associated with the current user.',
  })
  listContacts(@CurrentUser() user: AuthUser) {
    return this.users.listEmergencyContacts(user);
  }

  @Roles('CUSTOMER')
  @Post('emergency-contacts')
  @ApiOperation({
    summary: 'Add an emergency contact',
    description: 'Saves a new emergency contact who can be alerted during an SOS emergency.',
  })
  addContact(@CurrentUser() user: AuthUser, @Body() dto: EmergencyContactDto) {
    return this.users.addEmergencyContact(user, dto);
  }

  @Roles('CUSTOMER')
  @Delete('emergency-contacts/:id')
  @ApiOperation({
    summary: 'Remove an emergency contact',
    description: 'Deletes a saved emergency contact by ID.',
  })
  removeContact(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.removeEmergencyContact(user, id);
  }
}

@Module({
  imports: [EmailModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
