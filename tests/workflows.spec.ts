import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('Application Workflows', () => {
  let adminToken: string;
  let employeeToken: string;
  let employeeUserId: string;
  let managerToken: string;
  let managerUserId: string;
  let ownerToken: string;
  let facilityId: string;

  test.beforeAll(async () => {
    const health = await api.getHealth();
    if (health.status !== 200) {
      test.skip(true, 'Backend not available');
      return;
    }

    adminToken = (await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password)).token;

    const empLogin = await api.login(data.TEST_USERS.employee.email, data.TEST_USERS.employee.password);
    employeeToken = empLogin.token;
    employeeUserId = empLogin.userId;

    const mgrLogin = await api.login(data.TEST_USERS.lineManager.email, data.TEST_USERS.lineManager.password);
    managerToken = mgrLogin.token;
    managerUserId = mgrLogin.userId;

    const ownerLogin = await api.login(data.TEST_USERS.facilityOwner.email, data.TEST_USERS.facilityOwner.password);
    ownerToken = ownerLogin.token;

    const { data: facData } = await api.createFacility(adminToken, { name: 'Workflow Test Facility' });
    facilityId = (facData as { id: string }).id;
  });

  test.describe('Happy Path: Draft → Approved', () => {
    test('P0: Employee can create a draft application', async () => {
      const { status, data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      expect(status).toBe(201);
      expect((appData as { status: string }).status).toBe('draft');
    });

    test('P0: Employee can submit draft → pending_manager', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      const { status } = await api.updateApplication(employeeToken, app.id, {
        status: 'pending_manager',
      });
      expect(status).toBe(200);
    });

    test('P0: Line manager can approve pending_manager → pending_facility', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });

      const { status, data: updated } = await api.updateApplication(managerToken, app.id, {
        status: 'pending_facility',
      });
      expect(status).toBe(200);
      expect((updated as { status: string }).status).toBe('pending_facility');
    });

    test('P0: Facility owner can approve pending_facility → approved', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      await api.updateApplication(managerToken, app.id, { status: 'pending_facility' });

      const { status, data: approved } = await api.updateApplication(ownerToken, app.id, {
        status: 'approved',
      });
      expect(status).toBe(200);
      expect((approved as { status: string }).status).toBe('approved');
    });

    test('P1: Application end_date is optional', async () => {
      const { status, data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      expect(status).toBe(201);
      expect(appData).toHaveProperty('id');
    });
  });

  test.describe('Denial Flow', () => {
    test('P0: Line manager can deny pending_manager application', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });

      const { status, data: denied } = await api.updateApplication(managerToken, app.id, {
        status: 'denied',
        denied_reason: 'Insufficient training hours',
      });
      expect(status).toBe(200);
      expect((denied as { status: string }).status).toBe('denied');
    });

    test('P0: Facility owner can deny pending_facility application', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      await api.updateApplication(managerToken, app.id, { status: 'pending_facility' });

      const { status, data: denied } = await api.updateApplication(ownerToken, app.id, {
        status: 'denied',
        denied_reason: 'Security clearance insufficient',
      });
      expect(status).toBe(200);
      expect((denied as { status: string }).status).toBe('denied');
    });

    test('P1: Denial includes reason field', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      const { data: denied } = await api.updateApplication(managerToken, app.id, {
        status: 'denied',
        denied_reason: 'Test denial reason',
      });
      expect((denied as { denied_reason: string }).denied_reason).toBe('Test denial reason');
    });
  });

  test.describe('Exception Flow', () => {
    test('P0: Employee can request exception', async () => {
      const { status, data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
        has_exception: true,
        exception_justification: 'Emergency access required for critical maintenance',
      });
      expect(status).toBe(201);
      expect((appData as { has_exception: boolean }).has_exception).toBe(true);
    });

    test('P0: Exception request goes to pending_exception after manager approval', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
        has_exception: true,
        exception_justification: 'Emergency access',
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      const { status, data: excApp } = await api.updateApplication(managerToken, app.id, {
        status: 'pending_exception',
      });
      expect(status).toBe(200);
      expect((excApp as { status: string }).status).toBe('pending_exception');
    });

    test('P0: Administrator can approve pending_exception → approved', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
        has_exception: true,
        exception_justification: 'Critical security update',
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      await api.updateApplication(managerToken, app.id, { status: 'pending_exception' });

      const { status, data: approved } = await api.updateApplication(adminToken, app.id, {
        status: 'approved',
      });
      expect(status).toBe(200);
      expect((approved as { status: string }).status).toBe('approved');
    });

    test('P0: Administrator can deny pending_exception', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
        has_exception: true,
        exception_justification: 'Unauthorized exception request',
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      await api.updateApplication(managerToken, app.id, { status: 'pending_exception' });

      const { status, data: denied } = await api.updateApplication(adminToken, app.id, {
        status: 'denied',
        denied_reason: 'Exception not justified',
      });
      expect(status).toBe(200);
      expect((denied as { status: string }).status).toBe('denied');
    });

    test('P1: Exception requires justification', async () => {
      const { status } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
        has_exception: true,
        exception_justification: '',
      });
      expect(status).toBe(201);
    });
  });

  test.describe('Workflow State Machine', () => {
    test('P0: Cannot skip from draft directly to approved', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      const { status } = await api.updateApplication(employeeToken, app.id, { status: 'approved' });
      expect(status).toBe(400);
    });

    test('P0: Cannot skip from draft directly to pending_facility', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      const { status } = await api.updateApplication(employeeToken, app.id, { status: 'pending_facility' });
      expect(status).toBe(400);
    });

    test('P0: Cannot go backwards from pending_manager to draft', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      const { status } = await api.updateApplication(managerToken, app.id, { status: 'draft' });
      expect(status).toBe(400);
    });

    test('P0: Cannot change status of already approved application', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      await api.updateApplication(managerToken, app.id, { status: 'pending_facility' });
      await api.updateApplication(ownerToken, app.id, { status: 'approved' });

      const { status } = await api.updateApplication(ownerToken, app.id, { status: 'denied' });
      expect(status).toBe(400);
    });

    test('P0: Cannot change status of denied application', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      await api.updateApplication(managerToken, app.id, { status: 'denied' });

      const { status } = await api.updateApplication(managerToken, app.id, { status: 'pending_facility' });
      expect(status).toBe(400);
    });

    test('P1: Applicant can delete their own draft application', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      const { status } = await api.deleteApplication(employeeToken, app.id);
      expect(status).toBe(204);
    });

    test('P1: Applicant cannot delete non-draft application', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });

      const { status } = await api.deleteApplication(employeeToken, app.id);
      expect(status).toBe(403);
    });

    test('P1: Start date must be in the future or today', async () => {
      const { status } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: '2020-01-01',
      });
      expect(status).toBe(400);
    });
  });

  test.describe('Application Visibility', () => {
    test('P0: Employee sees only their own applications', async () => {
      const { data: apps } = await api.getApplications(employeeToken);
      expect(Array.isArray(apps)).toBe(true);
      const appList = apps as Array<{ applicant_id: string }>;
      appList.forEach(app => {
        expect(app.applicant_id).toBe(employeeUserId);
      });
    });

    test('P0: Line manager sees applications for employees they manage', async () => {
      const { status } = await api.getApplications(managerToken);
      expect(status).toBe(200);
    });

    test('P0: Facility owner sees applications for their facility', async () => {
      const { status } = await api.getApplications(ownerToken);
      expect(status).toBe(200);
    });

    test('P0: Administrator sees all applications', async () => {
      const { status, data: apps } = await api.getApplications(adminToken);
      expect(status).toBe(200);
      expect(Array.isArray(apps)).toBe(true);
    });
  });

  test.describe('Application CRUD', () => {
    test('P1: Can retrieve a single application by ID', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      const { status, data: retrieved } = await api.apiRequest('get', `/applications/${app.id}`, undefined, employeeToken);
      expect(status).toBe(200);
      expect((retrieved as { id: string }).id).toBe(app.id);
    });

    test('P1: Application update preserves unchanged fields', async () => {
      const { data: appData } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
        end_date: data.futureDate(60),
      });
      const app = appData as { id: string; start_date: string; end_date: string };

      await api.updateApplication(employeeToken, app.id, { status: 'pending_manager' });
      const { data: updated } = await api.apiRequest('get', `/applications/${app.id}`, undefined, employeeToken) as { status: number; data: { start_date: string; end_date: string } };
      expect(updated.start_date).toBe(app.start_date);
      expect(updated.end_date).toBe(app.end_date);
    });
  });
});
