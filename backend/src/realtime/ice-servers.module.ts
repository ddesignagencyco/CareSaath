import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHmac } from 'node:crypto';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

const DEFAULT_STUN_URLS = 'stun:stun.l.google.com:19302';
/** How long a TURN credential stays valid; short-lived so a leaked one is useless soon after. */
const TURN_CREDENTIAL_TTL_SECONDS = Number(process.env['TURN_CREDENTIAL_TTL_SECONDS'] ?? 3600);

function splitUrls(value: string): string[] {
  return value
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

/**
 * WebRTC NAT traversal config for the call RTCPeerConnection (TRD: production
 * calling needs a TURN server; the FE today falls back to a public STUN
 * server only). STUN is always returned; TURN is included only once
 * TURN_URLS/TURN_SHARED_SECRET are configured — standing up the TURN server
 * itself (e.g. coturn) is ops infrastructure, not something this API call can
 * create. Once it exists, this generates coturn's REST API time-limited
 * shared-secret credentials, so no per-user TURN account is needed.
 */
@Injectable()
export class IceServersService {
  get(user: AuthUser): { iceServers: IceServer[] } {
    const stunUrls = splitUrls(process.env['STUN_URLS'] ?? DEFAULT_STUN_URLS);
    const iceServers: IceServer[] = stunUrls.length > 0 ? [{ urls: stunUrls }] : [];

    const turnUrls = process.env['TURN_URLS'];
    const turnSecret = process.env['TURN_SHARED_SECRET'];
    if (turnUrls && turnSecret) {
      const expiresAt = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
      const username = `${expiresAt}:${user.sub}`;
      const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
      iceServers.push({ urls: splitUrls(turnUrls), username, credential });
    }
    return { iceServers };
  }
}

@ApiTags('System & Notifications')
@ApiBearerAuth()
@Controller('realtime')
export class IceServersController {
  constructor(private readonly iceServers: IceServersService) {}

  @Get('ice-servers')
  @ApiOperation({
    summary: 'WebRTC ICE server configuration',
    description: 'STUN (always) and TURN (once configured on the server) endpoints for the call RTCPeerConnection, with a fresh short-lived TURN credential.',
  })
  get(@CurrentUser() user: AuthUser) {
    return this.iceServers.get(user);
  }
}

@Module({
  controllers: [IceServersController],
  providers: [IceServersService],
  exports: [IceServersService],
})
export class IceServersModule {}
