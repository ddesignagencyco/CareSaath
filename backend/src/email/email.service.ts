import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: this.configService.get<number>('SMTP_PORT') === 465,
      auth: {
        user: this.configService.get<string>('SMTP_USERNAME'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      const result = await this.transporter.sendMail({
        from: `${this.configService.get<string>('SMTP_FROM_NAME')} <${this.configService.get<string>('SMTP_FROM_EMAIL')}>`,
        to,
        subject,
        html,
      });
      return result;
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      return { success: true, message: 'SMTP connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}
