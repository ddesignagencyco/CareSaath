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

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

@Module({
  controllers: [ReviewController, CustomerIncidentController, CaregiverIncidentController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
