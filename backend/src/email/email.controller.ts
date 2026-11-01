import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { EmailService } from './email.service.js';

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
    const html = `
      <h1>SMTP Test Email</h1>
      <p>This is a test email from CareSaath to verify SMTP configuration.</p>
      <p>If you received this email, SMTP is working correctly!</p>
    `;
    return this.emailService.sendEmail(body.to, subject, html);
  }
}
