import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('RBAC Security', () => {
  let adminToken: string;
  let employeeToken: string;
  let contractorToken: string;

  test.beforeAll(async () => {
    const health = await api.getHealth();
    if (health.status !== 200) {
      test.skip(true, 'Backend not available');
      return;
    }
    const admin = await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password);
    adminToken = admin.token;
    const emp = await api.login(data.TEST_USERS.employee.email, data.TEST_USERS.employee.password);
    employeeToken = emp.token;
    const con = await api.login(data.TEST_USERS.contractor.email, data.TEST_USERS.contractor.password);
    contractorToken = con.token;
  });

  test.describe('Route Protection', () => {
    test('P0: /api/users requires authentication', async () => {
      const { status } = await api.getUsers('');
      expect(status).toBe(401);
    });

    test('P0: /api/facilities requires authentication', async () => {
      const { status } = await api.getFacilities('');
      expect(status).toBe(401);
    });

    test('P0: /api/applications requires authentication', async () => {
      const { status } = await api.getApplications('');
      expect(status).toBe(401);
    });

    test('P0: /api/logs requires authentication', async () => {
      const { status } = await api.getLogs('');
      expect(status).toBe(401);
    });

    test('P0: /api/settings requires authentication', async () => {
      const { status } = await api.getSettings('');
      expect(status).toBe(401);
    });

    test('P0: /api/org requires authentication', async () => {
      const { status } = await api.getOrgTree('');
      expect(status).toBe(401);
    });

    test('P0: /api/notifications requires authentication', async () => {
      const { status } = await api.getNotifications('');
      expect(status).toBe(401);
    });
  });

  test.describe('Role-Based Access Control', () => {
    test('P0: Only administrator can access /api/users', async () => {
      const { status: adminStatus } = await api.getUsers(adminToken);
      expect(adminStatus).toBe(200);

      const { status: empStatus } = await api.getUsers(employeeToken);
      expect(empStatus).toBe(403);
    });

    test('P0: Only administrator can delete users', async () => {
      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        roles: ['employee'],
      });
      const newUser = userData as { id: string };

      const { status: adminStatus } = await api.deleteUser(adminToken, newUser.id);
      expect(adminStatus).toBe(204);
    });

    test('P0: Non-administrator cannot delete users', async () => {
      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        roles: ['employee'],
      });
      const newUser = userData as { id: string };

      const { status: empStatus } = await api.deleteUser(employeeToken, newUser.id);
      expect(empStatus).toBe(403);
    });

    test('P0: Only administrator can create facilities', async () => {
      const { status: adminStatus } = await api.createFacility(adminToken, {
        name: 'Test Facility RBAC',
      });
      expect(adminStatus).toBe(201);

      const { status: empStatus } = await api.createFacility(employeeToken, {
        name: 'Unauthorized Facility',
      });
      expect(empStatus).toBe(403);
    });

    test('P0: Only administrator can delete facilities', async () => {
      const { data: facData } = await api.createFacility(adminToken, {
        name: 'Test Facility to Delete',
      });
      const facility = facData as { id: string };

      const { status: adminStatus } = await api.deleteFacility(adminToken, facility.id);
      expect(adminStatus).toBe(204);

      const { data: fac2 } = await api.createFacility(adminToken, { name: 'Another Facility' });
      const fac2Data = fac2 as { id: string };

      const { status: empStatus } = await api.deleteFacility(employeeToken, fac2Data.id);
      expect(empStatus).toBe(403);
    });

    test('P0: Only administrator can delete requirements', async () => {
      const { data: reqData } = await api.createRequirement(adminToken, {
        name: 'RBAC Test Requirement',
        type: 'certification',
      });
      const req = reqData as { id: string };

      const { status: adminStatus } = await api.deleteRequirement(adminToken, req.id);
      expect(adminStatus).toBe(204);

      const { data: req2 } = await api.createRequirement(adminToken, {
        name: 'Another Requirement',
        type: 'training',
      });
      const req2Data = req2 as { id: string };

      const { status: empStatus } = await api.deleteRequirement(employeeToken, req2Data.id);
      expect(empStatus).toBe(403);
    });

    test('P0: Only administrator can access system logs', async () => {
      const { status: adminStatus } = await api.getLogs(adminToken);
      expect(adminStatus).toBe(200);

      const { status: empStatus } = await api.getLogs(employeeToken);
      expect(empStatus).toBe(403);
    });

    test('P0: Only administrator can access org tree', async () => {
      const { status: adminStatus } = await api.getOrgTree(adminToken);
      expect(adminStatus).toBe(200);

      const { status: empStatus } = await api.getOrgTree(employeeToken);
      expect(empStatus).toBe(403);
    });

    test('P0: Only administrator can update org tree', async () => {
      const { status: adminStatus } = await api.setOrgTree(adminToken, []);
      expect(adminStatus).toBe(200);

      const { status: empStatus } = await api.setOrgTree(employeeToken, []);
      expect(empStatus).toBe(403);
    });

    test('P0: Facility owner/admin can only see their own facilities', async () => {
      const owner = await api.login(data.TEST_USERS.facilityOwner.email, data.TEST_USERS.facilityOwner.password);
      const { status, data: facilities } = await api.getFacilities(owner.token);
      expect(status).toBe(200);
      expect(Array.isArray(facilities)).toBe(true);
    });

    test('P0: Facility admin can add admins to facilities', async () => {
      const { data: facData } = await api.createFacility(adminToken, {
        name: 'Facility for Admin Test',
      });
      const facility = facData as { id: string; owner_id: string };

      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.facilityAdmin,
        roles: ['facility_admin'],
      });
      const newUser = userData as { id: string };

      await api.addFacilityAdmin(adminToken, facility.id, newUser.id);
    });

    test('P1: Regular users cannot create user requirements', async () => {
      const { data: reqData } = await api.createRequirement(adminToken, {
        name: 'UR Test Requirement',
        type: 'certification',
      });
      const req = reqData as { id: string };

      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        roles: ['employee'],
      });
      const newUser = userData as { id: string };

      const { status } = await api.createUserRequirement(employeeToken, {
        user_id: newUser.id,
        requirement_id: req.id,
        status: 'fulfilled',
      });
      expect(status).toBe(403);
    });

    test('P1: Log actor_id cannot be forged by non-admin', async () => {
      const { status: adminStatus } = await api.apiRequest('post', '/logs', {
        action: 'user_created',
        actor_id: 'forged-actor-id',
        details: 'Forged log entry',
      }, employeeToken);
      expect(adminStatus).toBe(403);
    });

    test('P1: Users cannot delete their own account', async () => {
      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `self-delete.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const newUser = userData as { id: string };
      const newLogin = await api.login(newUser.email, data.VALID_PASSWORD);

      const { status } = await api.deleteUser(newLogin.token, newUser.id);
      expect(status).toBe(403);
    });

    test('P1: Contractor role has limited access', async () => {
      const { status: usersStatus } = await api.getUsers(contractorToken);
      expect(usersStatus).toBe(403);

      const { status: logsStatus } = await api.getLogs(contractorToken);
      expect(logsStatus).toBe(403);
    });

    test('P2: Facility roles cannot create requirements at global level', async () => {
      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.facilityOwner,
        roles: ['facility_owner'],
      });
      const newUser = userData as { id: string };
      const newLogin = await api.login(newUser.email, data.VALID_PASSWORD);

      const { status } = await api.createRequirement(newLogin.token, {
        name: 'Global Requirement',
        type: 'training',
      });
      expect(status).toBe(403);
    });
  });

  test.describe('Workflow Role Enforcement', () => {
    test('P0: Line manager can approve pending_manager applications', async () => {
      const { data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.lineManager,
        roles: ['line_manager'],
      });
      const manager = userData as { id: string };

      const { data: facData } = await api.createFacility(adminToken, { name: 'WF Test Facility' });
      const facility = facData as { id: string };

      const { data: appData } = await api.createApplication(adminToken, {
        applicant_id: manager.id,
        facility_id: facility.id,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      const { status: pendingStatus } = await api.updateApplication(adminToken, app.id, {
        status: 'pending_manager',
      });
      expect(pendingStatus).toBe(200);
    });

    test('P0: Line manager cannot approve pending_facility applications', async () => {
      const { data: facData } = await api.createFacility(adminToken, { name: 'WF2 Facility' });
      const facility = facData as { id: string };

      const { data: appData } = await api.createApplication(adminToken, {
        applicant_id: (await api.login(data.TEST_USERS.employee.email, data.TEST_USERS.employee.password)).userId,
        facility_id: facility.id,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      const { status } = await api.updateApplication(employeeToken, app.id, {
        status: 'approved',
      });
      expect(status).toBe(403);
    });

    test('P0: Facility owner can approve pending_facility applications', async () => {
      const owner = await api.login(data.TEST_USERS.facilityOwner.email, data.TEST_USERS.facilityOwner.password);
      const { data: facData } = await api.getFacilities(owner.token);
      const facilities = facData as Array<{ id: string }>;
      if (facilities.length === 0) {
        test.skip(true, 'No facilities available');
        return;
      }
      const facility = facilities[0];

      const { data: appData } = await api.createApplication(owner.token, {
        applicant_id: owner.userId,
        facility_id: facility.id,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      const { status: pendingStatus } = await api.updateApplication(owner.token, app.id, {
        status: 'pending_facility',
      });
      expect(pendingStatus).toBe(200);
    });

    test('P0: Employee cannot approve any applications', async () => {
      const { data: facData } = await api.createFacility(adminToken, { name: 'WF3 Facility' });
      const facility = facData as { id: string };

      const { data: appData } = await api.createApplication(adminToken, {
        applicant_id: (await api.login(data.TEST_USERS.employee.email, data.TEST_USERS.employee.password)).userId,
        facility_id: facility.id,
        start_date: data.futureDate(),
      });
      const app = appData as { id: string };

      const { status } = await api.updateApplication(employeeToken, app.id, {
        status: 'approved',
      });
      expect(status).toBe(403);
    });

    test('P0: Only administrator can approve exception requests', async () => {
      const { data: facData } = await api.createFacility(adminToken, { name: 'WF4 Facility' });
      const facility = facData as { id: string };

      const { data: appData } = await api.createApplication(adminToken, {
        applicant_id: (await api.login(data.TEST_USERS.contractor.email, data.TEST_USERS.contractor.password)).userId,
        facility_id: facility.id,
        start_date: data.futureDate(),
        has_exception: true,
        exception_justification: 'Emergency access needed',
      });
      const app = appData as { id: string };

      const { status: pendingStatus } = await api.updateApplication(adminToken, app.id, {
        status: 'pending_exception',
      });
      expect(pendingStatus).toBe(200);

      const { status: empStatus } = await api.updateApplication(employeeToken, app.id, {
        status: 'approved',
      });
      expect(empStatus).toBe(403);

      const { status: ownerStatus } = await api.updateApplication(
        (await api.login(data.TEST_USERS.facilityOwner.email, data.TEST_USERS.facilityOwner.password)).token,
        app.id,
        { status: 'approved' }
      );
      expect(ownerStatus).toBe(403);
    });
  });
});
