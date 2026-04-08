import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('Facilities & Areas', () => {
  let adminToken: string;
  let ownerToken: string;
  let facilityId: string;

  test.beforeAll(async () => {
    const health = await api.getHealth();
    if (health.status !== 200) {
      test.skip(true, 'Backend not available');
      return;
    }
    adminToken = (await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password)).token;
    ownerToken = (await api.login(data.TEST_USERS.facilityOwner.email, data.TEST_USERS.facilityOwner.password)).token;

    const { data: facData } = await api.createFacility(adminToken, { name: 'Test Facility for Areas' });
    facilityId = (facData as { id: string }).id;
  });

  test.describe('Facilities CRUD', () => {
    test('P0: Administrator can create a facility', async () => {
      const { status, data: facData } = await api.createFacility(adminToken, {
        name: 'New Test Facility',
        description: 'Test description',
        address: '123 Test St',
      });
      expect(status).toBe(201);
      expect((facData as { name: string }).name).toBe('New Test Facility');
    });

    test('P0: Administrator can list all facilities', async () => {
      const { status, data: facilities } = await api.getFacilities(adminToken);
      expect(status).toBe(200);
      expect(Array.isArray(facilities)).toBe(true);
    });

    test('P0: Administrator can update a facility', async () => {
      const { data: facData } = await api.createFacility(adminToken, { name: 'Update Test Facility' });
      const newFacId = (facData as { id: string }).id;

      const { status, data: updated } = await api.updateFacility(adminToken, newFacId, {
        description: 'Updated description',
      });
      expect(status).toBe(200);
      expect((updated as { description: string }).description).toBe('Updated description');
    });

    test('P0: Administrator can delete a facility', async () => {
      const { data: facData } = await api.createFacility(adminToken, { name: 'Delete Test Facility' });
      const newFacId = (facData as { id: string }).id;

      const { status } = await api.deleteFacility(adminToken, newFacId);
      expect(status).toBe(204);
    });

    test('P0: Facility owner can read their facility', async () => {
      const { status, data: facilities } = await api.getFacilities(ownerToken);
      expect(status).toBe(200);
      expect(Array.isArray(facilities)).toBe(true);
    });

    test('P0: Facility owner cannot create a facility', async () => {
      const { status } = await api.createFacility(ownerToken, { name: 'Unauthorized Facility' });
      expect(status).toBe(403);
    });

    test('P0: Facility owner cannot delete their facility', async () => {
      const { status } = await api.deleteFacility(ownerToken, facilityId);
      expect(status).toBe(403);
    });

    test('P1: Cannot create facility with empty name', async () => {
      const { status } = await api.createFacility(adminToken, { name: '' });
      expect(status).toBe(400);
    });

    test('P1: Facility name must be unique', async () => {
      await api.createFacility(adminToken, { name: 'Unique Name Facility' });
      const { status } = await api.createFacility(adminToken, { name: 'Unique Name Facility' });
      expect(status).toBe(409);
    });
  });

  test.describe('Areas CRUD', () => {
    test('P0: Can create an area under a facility', async () => {
      const { status, data: areaData } = await api.createArea(adminToken, {
        facility_id: facilityId,
        name: 'Test Area',
        description: 'A secure test area',
        security_level: 'medium',
      });
      expect(status).toBe(201);
      expect((areaData as { name: string }).name).toBe('Test Area');
    });

    test('P0: Can list areas for a facility', async () => {
      const { status, data: areas } = await api.getAreas(adminToken, facilityId);
      expect(status).toBe(200);
      expect(Array.isArray(areas)).toBe(true);
    });

    test('P0: Can update an area', async () => {
      const { data: areaData } = await api.createArea(adminToken, {
        facility_id: facilityId,
        name: 'Update Test Area',
        security_level: 'low',
      });
      const areaId = (areaData as { id: string }).id;

      const { status, data: updated } = await api.apiRequest('put', `/areas/${areaId}`, { description: 'Updated' }, adminToken);
      expect(status).toBe(200);
    });

    test('P0: Can delete an area', async () => {
      const { data: areaData } = await api.createArea(adminToken, {
        facility_id: facilityId,
        name: 'Delete Test Area',
      });
      const areaId = (areaData as { id: string }).id;

      const { status } = await api.deleteArea(adminToken, areaId);
      expect(status).toBe(204);
    });

    test('P0: Cannot create area without facility_id', async () => {
      const { status } = await api.createArea(adminToken, {
        facility_id: '',
        name: 'Orphan Area',
      });
      expect(status).toBe(400);
    });

    test('P0: Cannot create area with invalid security_level', async () => {
      const { status } = await api.createArea(adminToken, {
        facility_id: facilityId,
        name: 'Bad Security Area',
        security_level: 'invalid_level',
      });
      expect(status).toBe(400);
    });

    test('P1: Area belongs to correct facility', async () => {
      const { data: areaData } = await api.createArea(adminToken, {
        facility_id: facilityId,
        name: 'Belongs To Facility Area',
      });
      const areaId = (areaData as { id: string }).id;

      const { data: area } = await api.apiRequest('get', `/areas/${areaId}`, undefined, adminToken);
      expect((area as { facility_id: string }).facility_id).toBe(facilityId);
    });

    test('P1: All security levels are valid', async () => {
      for (const level of ['low', 'medium', 'high', 'critical'] as const) {
        const { status } = await api.createArea(adminToken, {
          facility_id: facilityId,
          name: `Security ${level} Area`,
          security_level: level,
        });
        expect(status).toBe(201);
      }
    });

    test('P2: Area name is required', async () => {
      const { status } = await api.createArea(adminToken, {
        facility_id: facilityId,
        name: '',
      });
      expect(status).toBe(400);
    });
  });

  test.describe('Facility Admins', () => {
    test('P0: Admin can add admin to facility', async () => {
      const { data: facData } = await api.createFacility(adminToken, { name: 'Admin Test Facility' });
      const newFacId = (facData as { id: string }).id;

      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.facilityAdmin,
        email: `facadmin.${Date.now()}@test.local`,
        roles: ['facility_admin'],
      });
      const newUserId = (userData as { id: string }).id;

      const { status } = await api.addFacilityAdmin(adminToken, newFacId, newUserId);
      expect(status).toBe(201);
    });

    test('P0: Admin can remove admin from facility', async () => {
      const { data: facData } = await api.createFacility(adminToken, { name: 'Remove Admin Facility' });
      const newFacId = (facData as { id: string }).id;

      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.facilityAdmin,
        email: `facadmin-rm.${Date.now()}@test.local`,
        roles: ['facility_admin'],
      });
      const newUserId = (userData as { id: string }).id;

      await api.addFacilityAdmin(adminToken, newFacId, newUserId);
      const { status } = await api.removeFacilityAdmin(adminToken, newFacId, newUserId);
      expect(status).toBe(204);
    });

    test('P1: Cannot add non-existent user as facility admin', async () => {
      const { status } = await api.addFacilityAdmin(adminToken, facilityId, '00000000-0000-0000-0000-000000000000');
      expect(status).toBe(400);
    });

    test('P1: Cannot add admin to non-existent facility', async () => {
      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.facilityAdmin,
        email: `facadmin-bad.${Date.now()}@test.local`,
        roles: ['facility_admin'],
      });
      const newUserId = (userData as { id: string }).id;

      const { status } = await api.addFacilityAdmin(adminToken, '00000000-0000-0000-0000-000000000000', newUserId);
      expect(status).toBe(404);
    });
  });
});
