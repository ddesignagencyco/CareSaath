import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { bearer, createTestApp, signAccessToken, uniquePhone } from './e2e-helpers.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';

describe('Customer self-service (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let close: () => Promise<void>;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, prisma, jwt, close } = await createTestApp());
    const user = await prisma.user.create({
      data: { phone: uniquePhone(), role: 'CUSTOMER', fullName: 'E2E Customer' },
    });
    userId = user.id;
    token = signAccessToken(jwt, user);
  });

  afterAll(async () => {
    await prisma.emergencyContact.deleteMany({ where: { userId } });
    await prisma.patientProfile.deleteMany({ where: { ownerUserId: userId } });
    await prisma.address.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await close();
  });

  it('reads and updates the profile', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/v1/customer/me')
      .set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.phone).toBe(expect.any(String) && me.body.phone);

    const patch = await request(app.getHttpServer())
      .patch('/api/v1/customer/me')
      .set(bearer(token))
      .send({ fullName: 'Renamed', preferredLanguage: 'UR' });
    expect(patch.status).toBe(200);
    expect(patch.body.fullName).toBe('Renamed');
    expect(patch.body.preferredLanguage).toBe('UR');
  });

  it('manages emergency contacts', async () => {
    const add = await request(app.getHttpServer())
      .post('/api/v1/customer/emergency-contacts')
      .set(bearer(token))
      .send({ name: 'Kin', phone: '+923001112222' });
    expect(add.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/customer/emergency-contacts')
      .set(bearer(token));
    expect(list.body).toHaveLength(1);

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/customer/emergency-contacts/${add.body.id}`)
      .set(bearer(token));
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });
  });

  it('runs the patient CRUD flow (FR-C2)', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/customer/patients')
      .set(bearer(token))
      .send({ name: 'Mother', relationship: 'FAMILY_MEMBER', medicalContext: 'diabetes' });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await request(app.getHttpServer())
      .get('/api/v1/customer/patients')
      .set(bearer(token));
    expect((list.body as unknown[]).length).toBe(1);

    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/customer/patients/${id}`)
      .set(bearer(token))
      .send({ name: 'Mother Updated' });
    expect(patch.body.name).toBe('Mother Updated');

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/customer/patients/${id}`)
      .set(bearer(token));
    expect(del.body).toEqual({ ok: true });
  });

  it('validates patient input', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customer/patients')
      .set(bearer(token))
      .send({});
    expect(res.status).toBe(400);
  });

  it('runs the address CRUD flow (FR-C7)', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/customer/addresses')
      .set(bearer(token))
      .send({
        label: 'Home',
        addressLine: '2 Test Ave',
        city: 'Karachi',
        latitude: '24.8607',
        longitude: '67.0011',
      });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const get = await request(app.getHttpServer())
      .get(`/api/v1/customer/addresses/${id}`)
      .set(bearer(token));
    expect(get.body.city).toBe('Karachi');

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/customer/addresses/${id}`)
      .set(bearer(token));
    expect(del.body).toEqual({ ok: true });
  });
});
