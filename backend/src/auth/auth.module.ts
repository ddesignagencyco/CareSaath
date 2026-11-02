import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SmsService } from './sms.service.js';
import { PlatformConfigModule } from '../config/platform-config.module.js';
import { EmailModule } from '../email/email.module.js';
import { FirebaseModule } from '../firebase/firebase.module.js';

@Module({
  imports: [JwtModule.register({ global: true }), PlatformConfigModule, EmailModule, FirebaseModule],
  controllers: [AuthController],
  providers: [AuthService, SmsService],
  exports: [AuthService],
})
export class AuthModule {}
