import { Module } from '@nestjs/common';
import { AdminWhatsAppController } from './admin-whatsapp.controller.js';

@Module({
  controllers: [AdminWhatsAppController],
})
export class WhatsAppModule {}
