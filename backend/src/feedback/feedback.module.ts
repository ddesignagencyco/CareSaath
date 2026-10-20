import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  IncidentPriority,
  IncidentSource,
  Prisma,
  UserRole,
  VisitStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ReportIncidentDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({ enum: IncidentPriority, default: IncidentPriority.MEDIUM })
  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority;
}

export class SosDto {
  @ApiProperty({ description: 'Visit the SOS is raised during.' })
  @IsString()
  visitId!: string;

  @ApiPropertyOptional({ description: 'Optional note about the emergency.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** FR-C12: rate and review a caregiver after a completed visit. */
  async review(user: AuthUser, visitId: string, dto: CreateReviewDto) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, booking: { customerId: user.sub } },
      include: { booking: true },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    if (visit.status !== VisitStatus.COMPLETED) {
      throw new BadRequestException('Only completed visits can be reviewed');
    }
    const existing = await this.prisma.review.findUnique({ where: { visitId } });
    if (existing) {
      throw new BadRequestException('This visit has already been reviewed');
    }
    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          visitId,
          customerId: user.sub,
          caregiverId: visit.booking.caregiverId,
          rating: dto.rating,
          comment: dto.comment ?? null,
        },
      });
      const aggregate = await tx.review.aggregate({
        where: { caregiverId: visit.booking.caregiverId },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await tx.caregiverProfile.update({
        where: { id: visit.booking.caregiverId },
        data: {
          ratingAverage: aggregate._avg.rating ?? 0,
          ratingCount: aggregate._count.rating,
        },
      });
      return created;
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'review.created',
      entityType: 'Review',
      entityId: review.id,
      metadata: { rating: dto.rating },
    });
    return review;
  }

  /** FR-C14: customer safety concern / complaint tied to a visit. */
  async reportCustomerIncident(user: AuthUser, visitId: string, dto: ReportIncidentDto) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, booking: { customerId: user.sub } },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return this.createIncident(user, visitId, IncidentSource.CUSTOMER_COMPLAINT, dto);
  }

  /** FR-CG10: caregiver safety / access issue at the patient's home. */
  async reportCaregiverIncident(user: AuthUser, visitId: string, dto: ReportIncidentDto) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, booking: { caregiverId: profile.id } },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return this.createIncident(user, visitId, IncidentSource.CAREGIVER_REPORT, dto);
  }

  private async createIncident(
    user: AuthUser,
    visitId: string,
    source: IncidentSource,
    dto: ReportIncidentDto,
  ) {
    const incident = await this.prisma.safetyIncident.create({
      data: {
        visitId,
        reportedById: user.sub,
        source,
        description: dto.description,
        priority: dto.priority ?? IncidentPriority.MEDIUM,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'safety_incident.reported',
      entityType: 'SafetyIncident',
      entityId: incident.id,
      metadata: { visitId, source, priority: incident.priority },
    });
    return incident;
  }

  /**
   * FR-C14: SOS during an active visit. Raises a CRITICAL incident (source SOS)
   * with an audit trail, then alerts admins and the customer's emergency
   * contacts. Any party on the visit may trigger it.
   */
  async raiseSos(user: AuthUser, dto: SosDto) {
    const caregiverProfile =
      user.role === UserRole.CAREGIVER
        ? await this.prisma.caregiverProfile.findUnique({
            where: { userId: user.sub },
            select: { id: true },
          })
        : null;
    const caregiverId = caregiverProfile?.id ?? null;

    const visit = await this.prisma.visit.findFirst({
      where: {
        id: dto.visitId,
        booking:
          user.role === UserRole.CAREGIVER
            ? { caregiverId: caregiverId ?? '__none__' }
            : { customerId: user.sub },
      },
      include: {
        booking: {
          include: {
            customer: { include: { emergencyContacts: true } },
            address: { select: { addressLine: true, city: true } },
          },
        },
      },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    const closed: VisitStatus[] = [
      VisitStatus.COMPLETED,
      VisitStatus.CANCELLED,
      VisitStatus.DECLINED,
    ];
    if (closed.includes(visit.status)) {
      throw new BadRequestException('SOS can only be raised during an active visit');
    }

    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.safetyIncident.create({
        data: {
          visitId: visit.id,
          reportedById: user.sub,
          source: IncidentSource.SOS,
          priority: IncidentPriority.CRITICAL,
          description: dto.note ?? 'SOS raised during visit',
        },
      });
      await tx.incidentEvent.create({
        data: {
          incidentId: created.id,
          actorId: user.sub,
          action: 'sos.raised',
          note: dto.note ?? null,
        },
      });
      return created;
    });

    await this.audit.log({
      actorId: user.sub,
      action: 'safety_incident.sos',
      entityType: 'SafetyIncident',
      entityId: incident.id,
      metadata: { visitId: visit.id, priority: IncidentPriority.CRITICAL },
    });

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, status: 'ACTIVE' },
      select: { id: true, phone: true },
    });
    const location = visit.booking.address
      ? `${visit.booking.address.addressLine}, ${visit.booking.address.city}`
      : undefined;
    for (const admin of admins) {
      await this.notifications.notify({
        userId: admin.id,
        phone: admin.phone,
        event: 'safety_incident.sos',
        payload: { incidentId: incident.id, visitId: visit.id, priority: 'CRITICAL' },
        message: `SOS on visit ${visit.id}${location ? ` at ${location}` : ''}. Immediate review required.`,
      });
    }
    for (const contact of visit.booking.customer.emergencyContacts) {
      await this.notifications.notify({
        userId: visit.booking.customer.id,
        phone: contact.phone,
        event: 'safety_incident.sos.contact',
        payload: { incidentId: incident.id, visitId: visit.id, contact: contact.name },
        message: `Emergency alert: an SOS was raised for ${
          visit.booking.customer.fullName || 'your contact'
        } during a CareSaath visit.`,
      });
    }

    return {
      incident,
      notifiedAdmins: admins.length,
      notifiedContacts: visit.booking.customer.emergencyContacts.length,
    };
  }

  listMine(user: AuthUser): Promise<Prisma.SafetyIncidentGetPayload<object>[]> {
    return this.prisma.safetyIncident.findMany({
      where: { reportedById: user.sub },
      orderBy: { createdAt: 'desc' },
    });
  }
}

@ApiTags('reviews')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER)
@Controller('customer/visits')
export class ReviewController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post(':id/review')
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.feedback.review(user, id, dto);
  }
}

@ApiTags('customer-visits')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER)
@Controller('customer/visits')
export class CustomerIncidentController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post(':id/safety-reports')
  report(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportIncidentDto,
  ) {
    return this.feedback.reportCustomerIncident(user, id, dto);
  }
}

@ApiTags('caregiver-safety')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver/safety-reports')
export class CaregiverIncidentController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  report(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReportIncidentDto & { visitId: string },
  ) {
    return this.feedback.reportCaregiverIncident(user, dto.visitId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.feedback.listMine(user);
  }
}

@ApiTags('sos')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.CAREGIVER)
@Controller('sos')
export class SosController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  raise(@CurrentUser() user: AuthUser, @Body() dto: SosDto) {
    return this.feedback.raiseSos(user, dto);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [
    ReviewController,
    CustomerIncidentController,
    CaregiverIncidentController,
    SosController,
  ],
  providers: [FeedbackService],
})
export class FeedbackModule {}
