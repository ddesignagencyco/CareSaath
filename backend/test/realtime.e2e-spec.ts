import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { io, Socket } from 'socket.io-client';
import { bearer, createTestApp, signAccessToken, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

/**
 * Live updates over WebSocket: connections are authenticated, joined only to
 * their own user/role rooms, and domain events and notifications reach exactly
 * the roles they are meant for.
 */
describe('Realtime (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let close: () => Promise<void>;
  let url: string;

  const startedAt = new Date();
  const sockets: Socket[] = [];
  const createdUserIds: string[] = [];
  let adminId: string;
  let adminToken: string;
  let customerToken: string;
  let bystanderToken: string;
  let newCaregiverToken: string;

  const connect = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
      sockets.push(socket);
      socket.on('ready', () => resolve(socket));
      socket.on('auth.error', (e: { message: string }) => reject(new Error(e.message)));
      socket.on('connect_error', reject);
    });

  const collect = (socket: Socket, event: string) => {
    const received: Array<Record<string, unknown>> = [];
    socket.on(event, (payload: Record<string, unknown>) => received.push(payload));
    return received;
  };

  const waitUntil = async (predicate: () => boolean, ms = 4000) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > ms) throw new Error('timed out waiting for the socket event');
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  beforeAll(async () => {
    ({ app, prisma, jwt, close } = await createTestApp());
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    url = `http://localhost:${address.port}`;

    const admin = await prisma.user.create({ data: { phone: uniquePhone(), role: 'ADMIN', fullName: 'RT Admin' } });
    const customer = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CUSTOMER' } });
    const bystander = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CUSTOMER' } });
    const newCaregiver = await prisma.user.create({ data: { phone: uniquePhone(), role: 'CUSTOMER' } });
    createdUserIds.push(admin.id, customer.id, bystander.id, newCaregiver.id);
    adminId = admin.id;
    adminToken = signAccessToken(jwt, admin);
    customerToken = signAccessToken(jwt, customer);
    bystanderToken = signAccessToken(jwt, bystander);
    newCaregiverToken = signAccessToken(jwt, newCaregiver);
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await prisma.caregiverProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    // The registration alert also went to the seeded admin(s); do not leave it in their feed.
    await prisma.notification.deleteMany({
      where: { event: 'caregiver.registered', createdAt: { gte: startedAt } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  });

  it('refuses a connection without a valid token', async () => {
    await expect(connect('not-a-real-token')).rejects.toThrow();
  });

  it('delivers a caregiver registration only to the admin and the registering user', async () => {
    const admin = await connect(adminToken);
    const bystander = await connect(bystanderToken);
    const registering = await connect(newCaregiverToken);

    const adminEntities = collect(admin, 'entity.updated');
    const adminNotes = collect(admin, 'notification.created');
    const bystanderEntities = collect(bystander, 'entity.updated');
    const bystanderNotes = collect(bystander, 'notification.created');
    const ownEntities = collect(registering, 'entity.updated');

    const res = await request(app.getHttpServer())
      .post('/api/v1/caregiver/register')
      .set(bearer(newCaregiverToken))
      .send({
        cnic: '35202-1234567-1',
        licenseNumber: `PNC-${Math.floor(Math.random() * 1e6)}`,
        licenseBody: 'PNC',
        specialty: 'NURSING',
        serviceCities: ['Lahore'],
        ratePerVisit: 150000,
      });
    expect(res.status).toBe(201);

    await waitUntil(() => adminEntities.length > 0 && adminNotes.length > 0 && ownEntities.length > 0);
    expect(adminEntities[0]).toMatchObject({ type: 'caregiver', action: 'registered', status: 'PENDING' });
    expect(adminNotes[0]).toMatchObject({
      event: 'caregiver.registered',
      audienceRole: 'ADMIN',
      title: 'New caregiver registration',
      readAt: null,
    });
    expect(ownEntities[0]).toMatchObject({ type: 'caregiver', action: 'registered' });

    // An unrelated customer must hear nothing about it.
    await new Promise((r) => setTimeout(r, 400));
    expect(bystanderEntities).toHaveLength(0);
    expect(bystanderNotes).toHaveLength(0);
  });

  it('shows the notification only in the admin feed and keeps unread counts per role', async () => {
    const adminFeed = await request(app.getHttpServer()).get('/api/v1/notifications').set(bearer(adminToken));
    expect(adminFeed.status).toBe(200);
    const events = (adminFeed.body.items as Array<{ event: string; channel: string }>).map((n) => n.event);
    expect(events).toContain('caregiver.registered');
    expect((adminFeed.body.items as Array<{ channel: string }>).every((n) => n.channel === 'PUSH')).toBe(true);

    const customerFeed = await request(app.getHttpServer()).get('/api/v1/notifications').set(bearer(customerToken));
    expect(customerFeed.body.items).toHaveLength(0);

    const before = await request(app.getHttpServer()).get('/api/v1/notifications/unread-count').set(bearer(adminToken));
    expect(before.body.unread).toBeGreaterThan(0);
    const customerUnread = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set(bearer(customerToken));
    expect(customerUnread.body.unread).toBe(0);
  });

  it('syncs read state to the user other open sessions', async () => {
    const admin = await connect(adminToken);
    const reads = collect(admin, 'notification.read');
    const res = await request(app.getHttpServer())
      .post('/api/v1/notifications/read')
      .set(bearer(adminToken))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.updated).toBeGreaterThan(0);
    await waitUntil(() => reads.length > 0);
    const after = await request(app.getHttpServer()).get('/api/v1/notifications/unread-count').set(bearer(adminToken));
    expect(after.body.unread).toBe(0);
    expect(adminId).toBeTruthy();
  });
});
