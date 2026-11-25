import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { randomInt } from 'node:crypto';
import { UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  getWhatsAppAdminStatus,
  logoutWhatsApp,
  reconnectWhatsApp,
  requestWhatsAppPairingCode,
  sendWhatsAppOtp,
} from '../services/whatsappOtp.service.js';

export class SendTestWhatsAppOtpDto {
  @ApiProperty({ example: '+923001234567', description: 'Recipient WhatsApp number to receive a test OTP' })
  @IsString()
  @Matches(/^\+?[0-9\s-]{10,18}$/, {
    message: 'phone must be a valid phone number (e.g. +923001234567)',
  })
  phone!: string;
}

@ApiTags('Admin - WhatsApp OTP')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/whatsapp')
export class AdminWhatsAppController {
  constructor(private readonly audit: AuditService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get WhatsApp OTP session status & QR code',
    description:
      'Returns live Baileys connection state, linked sender account info, and a scannable PNG QR data URL when awaiting pairing.',
  })
  status() {
    return getWhatsAppAdminStatus();
  }

  @Post('reconnect')
  @ApiOperation({
    summary: 'Reconnect WhatsApp OTP socket / refresh QR',
    description: 'Restarts the Baileys socket connection to obtain a fresh QR code or re-establish the session.',
  })
  async reconnect(@CurrentUser() admin: AuthUser) {
    const status = await reconnectWhatsApp();
    await this.audit.log({
      actorId: admin.sub,
      action: 'whatsapp.reconnected',
      entityType: 'WhatsAppSession',
      entityId: 'primary',
    });
    return { ok: true, status };
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Disconnect WhatsApp session & clear credentials',
    description: 'Logs out the current sender WhatsApp number, clears saved session keys, and generates a fresh QR code.',
  })
  async logout(@CurrentUser() admin: AuthUser) {
    await logoutWhatsApp();
    await this.audit.log({
      actorId: admin.sub,
      action: 'whatsapp.session_reset',
      entityType: 'WhatsAppSession',
      entityId: 'primary',
    });
    return { ok: true };
  }

  @Post('pairing-code')
  @ApiOperation({
    summary: 'Generate an 8-digit WhatsApp pairing code',
    description:
      'Requests an 8-character pairing code so the admin can link a sender phone number without scanning a QR code.',
  })
  async pairingCode(@CurrentUser() admin: AuthUser, @Body() dto: SendTestWhatsAppOtpDto) {
    let code: string;
    try {
      code = await requestWhatsAppPairingCode(dto.phone);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(msg);
    }
    await this.audit.log({
      actorId: admin.sub,
      action: 'whatsapp.pairing_code_requested',
      entityType: 'WhatsAppSession',
      entityId: 'primary',
      metadata: { phone: dto.phone },
    });
    return { ok: true, code };
  }

  @Post('test')
  @ApiOperation({
    summary: 'Send a test OTP via WhatsApp',
    description: 'Sends a sample 6-digit OTP to verify that the linked WhatsApp sender session delivers messages cleanly.',
  })
  async sendTest(@CurrentUser() admin: AuthUser, @Body() dto: SendTestWhatsAppOtpDto) {
    const testCode = randomInt(100000, 1000000).toString();
    try {
      await sendWhatsAppOtp(dto.phone, testCode, { purpose: 'TEST', ttlMinutes: 5 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(msg);
    }
    await this.audit.log({
      actorId: admin.sub,
      action: 'whatsapp.test_otp_sent',
      entityType: 'WhatsAppSession',
      entityId: 'primary',
      metadata: { phone: dto.phone },
    });
    return { ok: true, message: `Test OTP delivered to ${dto.phone}` };
  }
}
