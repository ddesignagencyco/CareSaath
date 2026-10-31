import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CaregiversService } from './caregivers.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { createAuditMock, createConfigMock, createPrismaMock, createStorageMock } from '../../test/test-helpers.js';

const cgUser: AuthUser = { sub: 'u-cg', role: 'CAREGIVER', phone: '+923000000002' };

function makeService() {
  const prisma = createPrismaMock();
  const config = createConfigMock({
    'booking.immediateMaxDistanceMeters': 5000,
    'caregiver.availableNowMaxFixAgeMinutes': 10,
    'booking.immediateAvgSpeedKmh': 30,
  });
  const service = new CaregiversService(
    prisma as never,
    createAuditMock() as never,
    createStorageMock() as never,
    { client: { get: vi.fn(), set: vi.fn() }, deleteByPattern: vi.fn() } as never,
    config as never,
    {} as never,
  );
  return { service, prisma };
}

const candidate = (
  id: string,
  lat: number,
  lng: number,
  serviceAreas: Array<{ latitude: number; longitude: number; radiusMeters: number }> = [],
) => ({
  id,
  specialty: 'NURSING',
  ratePerVisit: 5000,
  experienceYears: 2,
  bio: null,
  ratingAverage: 4.5,
  ratingCount: 3,
  serviceArea: { cities: ['Lahore'] },
  photoKey: null,
  badgeOverride: null,
  currentLat: lat,
  currentLng: lng,
  locationUpdatedAt: new Date(),
  user: { fullName: id },
  serviceAreas,
});

describe('CaregiversService — nearby-now search', () => {
  it('requires lat/lng', async () => {
    const { service } = makeService();
    await expect(service.searchNearbyNow({ immediate: true, page: 1, limit: 20 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('filters to available-now caregivers within range, sorted by distance, with distance + ETA', async () => {
    const { service, prisma } = makeService();
    prisma.caregiverProfile.findMany.mockResolvedValue([
      candidate('far', 31.52 + 0.04, 74.35), // ~4.4 km
      candidate('near', 31.52 + 0.009, 74.35), // ~1 km
      candidate('corner', 31.52 + 0.04, 74.35 + 0.04), // ~5.9 km: inside the box, outside the radius
    ]);
    prisma.visit.count.mockResolvedValue(0);
    const result = await service.searchNearbyNow({ immediate: true, lat: 31.52, lng: 74.35, page: 1, limit: 20 });
    expect(result.total).toBe(2);
    expect(result.items.map((c) => (c as { id: string }).id)).toEqual(['near', 'far']);
    const near = result.items[0] as { distanceMeters: number; etaMinutes: number; availableNow: boolean };
    expect(near.distanceMeters).toBeGreaterThan(900);
    expect(near.distanceMeters).toBeLessThan(1100);
    expect(near.etaMinutes).toBe(3); // ~1001 m at 500 m/min, rounded up
    expect(near.availableNow).toBe(true);
    const where = prisma.caregiverProfile.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      verificationStatus: 'APPROVED',
      acceptingImmediate: true,
      locationUpdatedAt: { gte: expect.any(Date) },
    });
  });

  it('excludes caregivers whose service zones do not cover the search point (matches the booking check)', async () => {
    const { service, prisma } = makeService();
    prisma.caregiverProfile.findMany.mockResolvedValue([
      // within range, but its only zone (2 km radius) is centred ~4.4 km from the point → not covered
      candidate('zoned-away', 31.52 + 0.009, 74.35, [{ latitude: 31.52 + 0.04, longitude: 74.35, radiusMeters: 2000 }]),
      // within range and its zone (3 km radius, centred on the point) covers the point
      candidate('zoned-ok', 31.52 + 0.01, 74.35, [{ latitude: 31.52, longitude: 74.35, radiusMeters: 3000 }]),
    ]);
    prisma.visit.count.mockResolvedValue(0);
    const result = await service.searchNearbyNow({ immediate: true, lat: 31.52, lng: 74.35, page: 1, limit: 20 });
    expect(result.items.map((c) => (c as { id: string }).id)).toEqual(['zoned-ok']);
  });
});

describe('CaregiversService — available now', () => {
  it('is false without a fresh fix', async () => {
    const { service } = makeService();
    const stale = new Date(Date.now() - 30 * 60_000);
    await expect(
      service.isAvailableNow({ id: 'cg', acceptingImmediate: true, locationUpdatedAt: stale, verificationStatus: 'APPROVED' }),
    ).resolves.toBe(false);
  });

  it('is false while on a visit, true otherwise', async () => {
    const { service, prisma } = makeService();
    const profile = { id: 'cg', acceptingImmediate: true, locationUpdatedAt: new Date(), verificationStatus: 'APPROVED' as const };
    prisma.availabilityBlock.count.mockResolvedValue(0);
    prisma.visit.count.mockResolvedValueOnce(1);
    await expect(service.isAvailableNow(profile)).resolves.toBe(false);
    prisma.visit.count.mockResolvedValueOnce(0);
    await expect(service.isAvailableNow(profile)).resolves.toBe(true);
  });

  it('only lets APPROVED caregivers switch it on', async () => {
    const { service, prisma } = makeService();
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg', verificationStatus: 'PENDING' });
    await expect(service.setAvailableNow(cgUser, { available: true })).rejects.toBeInstanceOf(BadRequestException);
  });
});
