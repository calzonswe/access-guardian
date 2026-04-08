import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('Applications', () => {
  let adminToken: string;
  let employeeToken: string;
  let employeeUserId: string;
  let managerToken: string;
  let managerUserId: string;
  let ownerToken: string;
  let facilityId: string;
  let requirementId: string;
  let areaId: string;

  test.beforeAll(async () => {
    const health = await api.getHealth();
    if (health.status !== 200) {
      test.skip(true, 'Backend not available');
      return;
    }

    adminToken = (await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password)).token;
    const emp = await api.login(data.TEST_USERS.employee.email, data.TEST_USERS.employee.password);
    employeeToken = emp.token;
    employeeUserId = emp.userId;
    const mgr = await api.login(data.TEST_USERS.lineManager.email, data.TEST_USERS.lineManager.password);
    managerToken = mgr.token;
    managerUserId = mgr.userId;
    ownerToken = (await api.login(data.TEST_USERS.facilityOwner.email, data.TEST_USERS.facilityOwner.password)).token;

    const { data: facData } = await api.createFacility(adminToken, { name: 'Applications Test Facility' });
    facilityId = (facData as { id: string }).id;

    const { data: reqData } = await api.createRequirement(adminToken, {
      name: 'Safety Certification',
      type: 'certification',
    });
    requirementId = (reqData as { id: string }).id;

    const { data: areaData } = await api.createArea(adminToken, {
      facility_id: facilityId,
      name: 'Test Area for Applications',
    });
    areaId = (areaData as { id: string }).id;

    await api.addFacilityRequirement(adminToken, facilityId, requirementId);
  });

  test.describe('Application Creation', () => {
    test('P0: Can create application with valid data', async () => {
      const { status, data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      expect(status).toBe(201);
      expect((app as { status: string }).status).toBe('draft');
    });

    test('P0: Application requires facility_id', async () => {
      const { status } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: '',
        start_date: data.futureDate(),
      });
      expect(status).toBe(400);
    });

    test('P0: Application requires start_date', async () => {
      const { status } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: '',
      });
      expect(status).toBe(400);
    });

    test('P1: Application with area_ids creates application_areas records', async () => {
      const { status, data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
        area_ids: [areaId],
      });
      expect(status).toBe(201);
      expect((app as { id: string }).id).toBeTruthy();
    });

    test('P1: Application with end_date set correctly', async () => {
      const endDate = data.futureDate(90);
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
        end_date: endDate,
      });
      expect((app as { end_date: string }).end_date).toBe(endDate);
    });
  });

  test.describe('Application Retrieval', () => {
    test('P0: Can list applications for current user', async () => {
      const { status, data: apps } = await api.getApplications(employeeToken);
      expect(status).toBe(200);
      expect(Array.isArray(apps)).toBe(true);
    });

    test('P0: Can retrieve single application by ID', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const { status, data: retrieved } = await api.apiRequest('get', `/applications/${appId}`, undefined, employeeToken);
      expect(status).toBe(200);
      expect((retrieved as { id: string }).id).toBe(appId);
    });

    test('P1: Cannot retrieve another user\'s application', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const newUser = await api.createUser(adminToken, {
        ...data.TEST_USERS.contractor,
        email: `other-app.${Date.now()}@test.local`,
        roles: ['contractor'],
      });
      const otherToken = (await api.login((newUser as { email: string }).email, data.VALID_PASSWORD)).token;

      const { status } = await api.apiRequest('get', `/applications/${appId}`, undefined, otherToken);
      expect(status).toBe(404);
    });

    test('P2: Application includes related facility info', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const { data: retrieved } = await api.apiRequest('get', `/applications/${appId}`, undefined, adminToken);
      expect((retrieved as { facility_id: string }).facility_id).toBe(facilityId);
    });
  });

  test.describe('Application Update', () => {
    test('P0: Can update application dates', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const newStartDate = data.futureDate(60);
      const { status } = await api.updateApplication(employeeToken, appId, {
        start_date: newStartDate,
      });
      expect(status).toBe(200);
    });

    test('P0: Cannot update application after approval', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      await api.updateApplication(employeeToken, appId, { status: 'pending_manager' });
      await api.updateApplication(managerToken, appId, { status: 'pending_facility' });
      await api.updateApplication(ownerToken, appId, { status: 'approved' });

      const { status } = await api.updateApplication(employeeToken, appId, {
        start_date: data.futureDate(90),
      });
      expect(status).toBe(400);
    });
  });

  test.describe('Application Deletion', () => {
    test('P0: Applicant can delete draft application', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const { status } = await api.deleteApplication(employeeToken, appId);
      expect(status).toBe(204);
    });

    test('P0: Cannot delete submitted application', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      await api.updateApplication(employeeToken, appId, { status: 'pending_manager' });

      const { status } = await api.deleteApplication(employeeToken, appId);
      expect(status).toBe(403);
    });

    test('P1: Admin can delete any application', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const { status } = await api.deleteApplication(adminToken, appId);
      expect(status).toBe(204);
    });
  });

  test.describe('Attachments', () => {
    test('P0: Can upload attachment to application', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const { status, data: attachment } = await api.uploadAttachment(
        employeeToken,
        appId,
        'test-certificate.pdf',
        data.base64File('test-certificate.pdf', 'Test PDF content')
      );
      expect(status).toBe(201);
      expect((attachment as { file_name: string }).file_name).toBe('test-certificate.pdf');
    });

    test('P0: Can delete attachment', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const { data: attachment } = await api.uploadAttachment(
        employeeToken,
        appId,
        'delete-me.pdf',
        data.base64File('delete-me.pdf', 'Content')
      );
      const attachmentId = (attachment as { id: string }).id;

      const { status } = await api.deleteAttachment(employeeToken, attachmentId);
      expect(status).toBe(204);
    });

    test('P1: Attachment upload rejects oversized file', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      const { status } = await api.uploadAttachment(
        employeeToken,
        appId,
        'too-large.pdf',
        data.base64File('too-large.pdf', largeContent)
      );
      expect(status).toBe(413);
    });

    test('P1: Attachment upload validates file type', async () => {
      const { data: app } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      const appId = (app as { id: string }).id;

      const { status } = await api.uploadAttachment(
        employeeToken,
        appId,
        'script.exe',
        data.base64File('script.exe', 'malicious content')
      );
      expect(status).toBe(400);
    });
  });

  test.describe('Requirements Coverage', () => {
    test('P1: Application can be created when user has all facility requirements', async () => {
      await api.createUserRequirement(adminToken, {
        user_id: employeeUserId,
        requirement_id: requirementId,
        status: 'fulfilled',
      });

      const { status } = await api.createApplication(employeeToken, {
        applicant_id: employeeUserId,
        facility_id: facilityId,
        start_date: data.futureDate(),
      });
      expect(status).toBe(201);
    });
  });
});
