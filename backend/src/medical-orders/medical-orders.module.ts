import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Specialty, VerificationStatus } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';
import { UserRole } from '../generated/prisma/client.js';

export class MedicineDto {
  @ApiProperty({ example: 'Amoxicillin 500mg' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: '1 tablet' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dosage?: string;

  @ApiPropertyOptional({ example: 'Twice daily' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  frequency?: string;

  @ApiPropertyOptional({ example: '7 days' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  duration?: string;

  @ApiPropertyOptional({ example: 'Take after meals' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class LabTestDto {
  @ApiProperty({ example: 'Complete Blood Count (CBC)' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Fasting required' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class CreateMedicalOrderDto {
  @ApiPropertyOptional({ example: 'Upper respiratory tract infection' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  diagnosis?: string;

  @ApiPropertyOptional({ type: [MedicineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MedicineDto)
  medicines?: MedicineDto[];

  @ApiPropertyOptional({ type: [LabTestDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LabTestDto)
  labTests?: LabTestDto[];
}

@Injectable()
export class MedicalOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** Only a verified, DOCTOR-specialty caregiver may author a medical order. */
  private async assertDoctor(user: AuthUser) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true, specialty: true, verificationStatus: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    if (profile.specialty !== Specialty.DOCTOR || profile.verificationStatus !== VerificationStatus.APPROVED) {
      throw new ForbiddenException(
        'Only a verified doctor may prescribe medicines, order lab tests, or record a diagnosis',
      );
    }
    return profile;
  }

  /** Visit the caller (customer, assigned caregiver, or admin) is entitled to see. */
  private async loadVisitForParty(user: AuthUser, visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: {
        id: visitId,
        booking:
          user.role === UserRole.ADMIN
            ? {}
            : user.role === UserRole.CUSTOMER
              ? { customerId: user.sub }
              : { caregiver: { userId: user.sub } },
      },
      select: {
        id: true,
        booking: { select: { caregiverId: true, patientId: true, customerId: true } },
      },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return visit;
  }

  async create(user: AuthUser, visitId: string, dto: CreateMedicalOrderDto) {
    const doctor = await this.assertDoctor(user);
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, booking: { caregiverId: doctor.id } },
      select: { id: true, booking: { select: { patientId: true, customerId: true } } },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    const order = await this.prisma.medicalOrder.create({
      data: {
        visitId,
        doctorId: doctor.id,
        patientId: visit.booking.patientId,
        diagnosis: dto.diagnosis ?? null,
        medicines: (dto.medicines ?? []) as object[],
        labTests: (dto.labTests ?? []) as object[],
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'medical_order.created',
      entityType: 'MedicalOrder',
      entityId: order.id,
      metadata: { visitId },
    });
    await this.notifications.notify({
      userId: visit.booking.customerId,
      event: 'medical_order.created',
      payload: { visitId, medicalOrderId: order.id },
      message: 'Your doctor recorded a diagnosis and/or prescription for this visit.',
    });
    this.realtime?.entityUpdated(
      { users: [visit.booking.customerId] },
      { type: 'visit', id: visitId, action: 'medical_order_created', data: { medicalOrderId: order.id } },
    );
    return order;
  }

  async listForVisit(user: AuthUser, visitId: string) {
    const visit = await this.loadVisitForParty(user, visitId);
    return this.prisma.medicalOrder.findMany({
      where: { visitId: visit.id },
      orderBy: { createdAt: 'desc' },
    });
  }
}

@ApiTags('Caregiver - Visits')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver/visits/:visitId/medical-orders')
export class CaregiverMedicalOrdersController {
  constructor(private readonly medicalOrders: MedicalOrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Record a diagnosis, prescription, or lab-test order',
    description:
      'Doctor-only: creates a structured diagnosis/medicines/lab-tests record for a visit. Only a verified caregiver profile with specialty DOCTOR, assigned to this visit, may call this.',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() dto: CreateMedicalOrderDto,
  ) {
    return this.medicalOrders.create(user, visitId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List medical orders for a visit',
    description: 'Retrieves diagnosis/prescription/lab-test records for a visit assigned to the caller.',
  })
  list(@CurrentUser() user: AuthUser, @Param('visitId', ParseUUIDPipe) visitId: string) {
    return this.medicalOrders.listForVisit(user, visitId);
  }
}

@ApiTags('Customer - Visits')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('customer/visits/:visitId/medical-orders')
export class CustomerMedicalOrdersController {
  constructor(private readonly medicalOrders: MedicalOrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'List medical orders for a visit',
    description: "Retrieves the doctor's diagnosis/prescription/lab-test records for the customer's own visit.",
  })
  list(@CurrentUser() user: AuthUser, @Param('visitId', ParseUUIDPipe) visitId: string) {
    return this.medicalOrders.listForVisit(user, visitId);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [CaregiverMedicalOrdersController, CustomerMedicalOrdersController],
  providers: [MedicalOrdersService],
  exports: [MedicalOrdersService],
})
export class MedicalOrdersModule {}
