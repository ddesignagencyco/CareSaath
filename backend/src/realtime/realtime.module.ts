import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';
import { CallSignalingService } from './call-signaling.service.js';

/** Global so any feature module can push live updates by injecting RealtimeService. */
@Global()
@Module({
  providers: [RealtimeGateway, RealtimeService, CallSignalingService],
  exports: [RealtimeService, CallSignalingService],
})
export class RealtimeModule {}
