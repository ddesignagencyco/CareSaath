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
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

class CreatePatientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: PatientRelation })
  @IsOptional()
  @IsEnum(PatientRelation)
  relationship?: PatientRelation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string;

  @ApiPropertyOptional({ description: 'Basic medical context (FR-C2). Sensitive.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  medicalContext?: string;
}

class UpdatePatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: PatientRelation })
  @IsOptional()
  @IsEnum(PatientRelation)
  relationship?: PatientRelation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  medicalContext?: string;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.patientProfile.findMany({
      where: { ownerUserId: user.sub },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const profile = await this.prisma.patientProfile.findFirst({
      where: { id, ownerUserId: user.sub },
    });
    if (!profile) {
      throw new NotFoundException('Patient profile not found');
    }
    return profile;
  }

  async create(user: AuthUser, dto: CreatePatientDto) {
    const profile = await this.prisma.patientProfile.create({
      data: {
        ownerUserId: user.sub,
        name: dto.name,
        relationship: dto.relationship ?? PatientRelation.SELF,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender: dto.gender ?? null,
        medicalContext: dto.medicalContext ?? null,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'patient.created',
      entityType: 'PatientProfile',
      entityId: profile.id,
    });
    return profile;
  }

  async update(user: AuthUser, id: string, dto: UpdatePatientDto) {
    await this.get(user, id);
    const profile = await this.prisma.patientProfile.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.relationship !== undefined ? { relationship: dto.relationship } : {}),
        ...(dto.dateOfBirth !== undefined
          ? { dateOfBirth: new Date(dto.dateOfBirth) }
          : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.medicalContext !== undefined
          ? { medicalContext: dto.medicalContext }
          : {}),
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'patient.updated',
      entityType: 'PatientProfile',
      entityId: id,
    });
    return profile;
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    const bookings = await this.prisma.booking.count({ where: { patientId: id } });
    if (bookings > 0) {
      // Keep history: refuse hard delete when referenced (design).
      throw new NotFoundException(
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

@ApiTags('patients')
@ApiBearerAuth()
@Controller('customer/patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.patients.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.patients.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePatientDto) {
    return this.patients.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patients.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.patients.remove(user, id);
  }
}

@Module({
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
