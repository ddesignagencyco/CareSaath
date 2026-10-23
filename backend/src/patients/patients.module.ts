import {
  Body,
  ConflictException,
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
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PatientRelation } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import {
  decryptMaybe,
  deriveKey,
  encryptField,
} from '../common/crypto/field-encryption.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

/** ERD §3.2 / TRD §9: patient medical context is stored encrypted at rest. */
const MEDICAL_KEY = deriveKey('MEDICAL_ENCRYPTION_KEY', 'caresaath-dev-medical-key');

/** Return the profile with medicalContext decrypted for the owner. */
function present<T extends { medicalContext: string | null }>(profile: T): T {
  return {
    ...profile,
    medicalContext: decryptMaybe(profile.medicalContext, MEDICAL_KEY),
  };
}

export class CreatePatientDto {
  @ApiProperty({ example: 'Rukhsana Khan', description: 'Patient full legal name' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: PatientRelation, example: PatientRelation.FAMILY_MEMBER, description: 'Relationship to account holder (SELF or FAMILY_MEMBER)' })
  @IsOptional()
  @IsEnum(PatientRelation)
  relationship?: PatientRelation;

  @ApiPropertyOptional({ example: '1958-11-02', description: 'Date of birth (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'female', description: 'Gender' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string;

  @ApiPropertyOptional({
    example: 'Type-2 diabetes, mild hypertension. Requires assistance with daily mobility.',
    description: 'Basic medical context (FR-C2). Stored encrypted with AES-256-GCM.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  medicalContext?: string;
}

export class UpdatePatientDto {
  @ApiPropertyOptional({ example: 'Rukhsana Khan' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: PatientRelation, example: PatientRelation.FAMILY_MEMBER })
  @IsOptional()
  @IsEnum(PatientRelation)
  relationship?: PatientRelation;

  @ApiPropertyOptional({ example: '1958-11-02', nullable: true, description: 'null clears the date of birth' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ example: 'female', nullable: true, description: 'null clears the gender' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string | null;

  @ApiPropertyOptional({
    example: 'Post-operative knee recovery; limited stairs.',
    description: 'Updated medical context (stored encrypted). null or empty clears it.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  medicalContext?: string | null;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const list = await this.prisma.patientProfile.findMany({
      where: { ownerUserId: user.sub },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(present);
  }

  async get(user: AuthUser, id: string) {
    const profile = await this.prisma.patientProfile.findFirst({
      where: { id, ownerUserId: user.sub },
    });
    if (!profile) {
      throw new NotFoundException('Patient profile not found');
    }
    return present(profile);
  }

  async create(user: AuthUser, dto: CreatePatientDto) {
    const created = await this.prisma.patientProfile.create({
      data: {
        ownerUserId: user.sub,
        name: dto.name,
        relationship: dto.relationship ?? PatientRelation.SELF,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender: dto.gender ?? null,
        medicalContext: dto.medicalContext
          ? encryptField(dto.medicalContext, MEDICAL_KEY)
          : null,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'patient.created',
      entityType: 'PatientProfile',
      entityId: created.id,
    });
    return present(created);
  }

  async update(user: AuthUser, id: string, dto: UpdatePatientDto) {
    await this.get(user, id);
    const updated = await this.prisma.patientProfile.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.relationship !== undefined ? { relationship: dto.relationship } : {}),
        ...(dto.dateOfBirth !== undefined
          ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }
          : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender || null } : {}),
        ...(dto.medicalContext !== undefined
          ? {
              medicalContext: dto.medicalContext
                ? encryptField(dto.medicalContext, MEDICAL_KEY)
                : null,
            }
          : {}),
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'patient.updated',
      entityType: 'PatientProfile',
      entityId: id,
    });
    return present(updated);
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    const bookingCount = await this.prisma.booking.count({ where: { patientId: id } });
    if (bookingCount > 0) {
      // Keep history: refuse hard delete when referenced (design).
      throw new ConflictException(
        'Patient has bookings; medical records must be retained for audit',
      );
    }
    await this.prisma.patientProfile.delete({ where: { id } });
    await this.audit.log({
      actorId: user.sub,
      action: 'patient.deleted',
      entityType: 'PatientProfile',
      entityId: id,
    });
    return { ok: true as const };
  }
}

@ApiTags('Customer - Patients')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('customer/patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @ApiOperation({
    summary: 'List customer patient profiles',
    description: 'Retrieves all patient profiles registered under the authenticated customer.',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.patients.list(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get patient profile by ID',
    description: 'Retrieves patient details with medical context decrypted for the owner.',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.patients.get(user, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a patient profile',
    description: 'Registers a new patient profile (self or family member). Medical context is encrypted with AES-256-GCM before saving.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePatientDto) {
    return this.patients.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update patient profile',
    description: 'Updates demographic and medical details of a patient profile.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patients.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete patient profile',
    description: 'Removes a patient profile provided they have no historical bookings.',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.patients.remove(user, id);
  }
}

@Module({
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
