import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminWhatsAppController } from './admin-whatsapp.controller.js';
import { WhatsAppService } from './whatsapp.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [AdminWhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
