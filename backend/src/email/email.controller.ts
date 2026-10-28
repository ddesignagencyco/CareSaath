import { Controller, Post, Body, Get } from '@nestjs/common';
import { EmailService } from './email.service.js';

@Controller('api/v1/email')
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
