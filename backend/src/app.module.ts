import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditModule } from './common/audit/audit.module.js';
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
import { VisitsModule } from './visits/visits.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    PrismaModule,
    RedisModule,
    AuditModule,
    StorageModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    AddressesModule,
    CaregiversModule,
    AvailabilityModule,
    VerificationModule,
    NotificationsModule,
    BookingsModule,
    VisitsModule,
    FeedbackModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
