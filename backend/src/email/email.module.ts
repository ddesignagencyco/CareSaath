import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service.js';

/**
 * SMTP transport only. The previous `email/test-connection` and
 * `email/send-test` endpoints were removed: any authenticated user could use
 * them to send arbitrary mail (an open relay) and they were not needed at
 * runtime.
 */
@Module({
  imports: [ConfigModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
