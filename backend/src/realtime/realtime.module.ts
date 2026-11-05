import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';
import { CallSignalingService } from './call-signaling.service.js';
import { CallRingingService } from './call-ringing.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

/** Global so any feature module can push live updates by injecting RealtimeService. */
@Global()
@Module({
  imports: [NotificationsModule],
  providers: [RealtimeGateway, RealtimeService, CallSignalingService, CallRingingService],
  exports: [RealtimeService, CallSignalingService],
})
export class RealtimeModule {}
