import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { EmailService } from './email.service.js';
import { renderSmtpTestEmail } from './templates.js';

/**
 * SMTP diagnostics. Admin-only: `send-test` can put arbitrary HTML in a mail
 * sent *from* the platform address, so it must not be open to every signed-in
 * user. The path carries no `api/v1` segment — `setGlobalPrefix` already adds it.
 */
@ApiTags('Email')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('email')
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Get('test-connection')
  async testConnection() {
    return this.emailService.testConnection();
  }

  @Post('send-test')
  async sendTestEmail(@Body() body: { to: string; subject?: string }) {
    const subject = body.subject || 'Test Email from CareSaath';
    return this.emailService.sendEmail(body.to, subject, renderSmtpTestEmail());
  }
}
