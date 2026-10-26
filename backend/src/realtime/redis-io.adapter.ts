import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter backed by Redis pub/sub, so an event emitted by one API
 * instance reaches sockets connected to any other instance behind the load
 * balancer. Without it a user connected to instance B would miss events caused
 * by a request that landed on instance A.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  connectToRedis(url: string): void {
    const pub = new Redis(url);
    const sub = pub.duplicate();
    // Surface connection problems in the log instead of crashing on an unhandled 'error'.
    pub.on('error', (err) => console.error('[realtime] redis pub error:', err.message));
    sub.on('error', (err) => console.error('[realtime] redis sub error:', err.message));
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options) as import('socket.io').Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
