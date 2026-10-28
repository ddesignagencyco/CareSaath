import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditModule } from './common/audit/audit.module.js';
import { compressionMiddleware } from './common/middleware/compression.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { StorageModule } from './common/storage/storage.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { PatientsModule } from './patients/patients.module.js';
import { AddressesModule } from './addresses/addresses.module.js';
import { CaregiversModule } from './caregivers/caregivers.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { VerificationModule } from './verification/verification.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { BookingExpiryModule } from './bookings/booking-expiry.service.js';
import { VisitsModule } from './visits/visits.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { MedicalOrdersModule } from './medical-orders/medical-orders.module.js';
import { ChatModule } from './chat/chat.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PayoutsModule } from './payouts/payouts.module.js';
import { CommissionsModule } from './commissions/commissions.module.js';
import { PromosModule } from './promos/promos.module.js';
import { DisputesModule } from './disputes/disputes.module.js';
import { AdminAnalyticsModule } from './admin/analytics.module.js';
import { AdminSafetyModule } from './admin/safety.module.js';
import { PlatformConfigModule } from './config/platform-config.module.js';
import { RetentionModule } from './common/retention/retention.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { EmailModule } from './email/email.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    PrismaModule,
    RedisModule,
    AuditModule,
    StorageModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    AddressesModule,
    CaregiversModule,
    AvailabilityModule,
    VerificationModule,
    NotificationsModule,
    BookingsModule,
    BookingExpiryModule,
    VisitsModule,
    FeedbackModule,
    MedicalOrdersModule,
    ChatModule,
    PaymentsModule,
    PayoutsModule,
    CommissionsModule,
    PromosModule,
    DisputesModule,
    AdminAnalyticsModule,
    AdminSafetyModule,
    PlatformConfigModule,
    RetentionModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(compressionMiddleware()).forRoutes('*');
  }
}
