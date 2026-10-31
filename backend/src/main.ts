import './config/load-env.js';
import { NestFactory } from '@nestjs/core';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './realtime/redis-io.adapter.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: '', method: RequestMethod.GET },
    ],
  });
  // Fan socket events out through Redis so every API instance reaches its own connected clients.
  const socketAdapter = new RedisIoAdapter(app);
  socketAdapter.connectToRedis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  app.useWebSocketAdapter(socketAdapter);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    // Production Vercel origin + any localhost port for local dev (frontend runs on :3001).
    origin: ['https://caresaath-ui.vercel.app', /^http:\/\/localhost:\d+$/],
    exposedHeaders: ['Content-Disposition', 'X-Cache'],
  });

  const swaggerDescription = [
    '## Welcome to CareSaath API Documentation',
    'Home nursing and physiotherapy marketplace backend for Pakistan.',
    '',
    '---',
    '',
    '### Quick Interactive Guide (Try it out!)',
    '',
    '1. **Authentication Flow:**',
    '   - **Step 1:** Go to the **Auth** section and call `POST /api/v1/auth/otp/request` with any demo phone:',
    '     - **Admin:** `+923000000000`',
    '     - **Customer:** `+923001110001` (Ayesha Khan) or `+923001110002` (Bilal Ahmed)',
    '     - **Caregiver:** `+923001110011` (Fatima Noor - Nurse) or `+923001110012` (Ali Raza - Physio)',
    '   - **Step 2:** The OTP is captured locally in **MailHog** at http://localhost:18025 or logged in your server console.',
    '   - **Step 3:** Call `POST /api/v1/auth/otp/verify` with the phone and OTP to obtain the `accessToken`.',
    '   - **Step 4:** Click the green **Authorize** button at the top right of this page and enter `Bearer <accessToken>`.',
    '',
    '2. **Feature Areas:**',
    '   - **Customer**: Search verified caregivers, manage patients/addresses, book visits, upload prescriptions, and track status.',
    '   - **Caregiver**: Register credentials, set weekly availability, accept requests, GPS/OTP check-in, and clinical visit notes.',
    '   - **Admin**: Approve/reject caregiver credentials, review safety incidents, resolve disputes, configure commissions, and export reports.',
  ].join('\n');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CareSaath Marketplace API')
    .setDescription(swaggerDescription)
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token obtained from /api/v1/auth/otp/verify',
      },
      'bearer',
    )
    .addTag('Auth', 'Phone OTP login, token refresh, and logout')
    .addTag('Customer - Profile', 'Customer account management, language preferences, emergency contacts')
    .addTag('Customer - Patients', 'Patient profiles (self and family) with AES-256 encrypted medical context')
    .addTag('Customer - Addresses', 'Saved home/office addresses with geographic latitude/longitude')
    .addTag('Customer - Discovery', 'Public search for approved caregivers and public profile lookups')
    .addTag('Customer - Bookings', 'Booking creation (single/recurring), cancellations, rescheduling, and prescriptions')
    .addTag('Customer - Visits', 'Real-time visit progress tracking for customers')
    .addTag('Customer - Payments', 'Visit checkout and payment history')
    .addTag('Customer - Feedback & Safety', 'Star reviews, safety incident complaints, and SOS panic alert')
    .addTag('Caregiver - Profile', 'Onboarding registration, profile updates, credential documents and photo uploads')
    .addTag('Caregiver - Availability', 'Weekly recurring schedule rules and blackout date blocks')
    .addTag('Caregiver - Bookings', 'Incoming booking request management (accept or decline)')
    .addTag('Caregiver - Visits', 'En-route status, GPS & OTP check-in, check-out, and clinical notes')
    .addTag('Caregiver - Payments & Payouts', 'Cash collection confirmations, earnings balance, and withdrawal requests')
    .addTag('Caregiver - Safety', 'Caregiver home access and safety incident reports')
    .addTag('Disputes', 'Customer and caregiver visit dispute mediation')
    .addTag('Admin - Caregivers', 'Caregiver credential verification queue, approvals, re-verification, and suspensions')
    .addTag('Admin - Safety & Disputes', 'Platform safety incidents triage and dispute mediation')
    .addTag('Admin - Finance & Payouts', 'Specialty commission rate settings and caregiver withdrawal approvals')
    .addTag('Admin - Promos & Config', 'Discount promo codes and tunable runtime platform parameters')
    .addTag('Admin - Analytics & Reports', 'Business metrics overview and CSV data exports')
    .addTag('System & Health', 'PostgreSQL and Redis health check probes')
    .addTag('System & Webhooks', 'Payment gateway webhooks for asynchronous settlement')
    .addTag('System & Notifications', 'Dispatched SMS, Push, and WhatsApp notifications')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
    },
    customSiteTitle: 'CareSaath API Docs',
  });

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port, '0.0.0.0');

  const base = `http://localhost:${port}`;
  const logger = new Logger('Bootstrap');
  logger.log(`API base:       ${base}/api/v1`);
  logger.log(`Swagger UI:     ${base}/docs`);
  logger.log(`OpenAPI JSON:   ${base}/docs-json`);
}
await bootstrap();
