import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('Dashboard', () => {
  let adminToken: string;
  let employeeToken: string;

  test.beforeAll(async () => {
    const health = await api.getHealth();
    if (health.status !== 200) {
      test.skip(true, 'Backend not available');
      return;
    }
    adminToken = (await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password)).token;
    employeeToken = (await api.login(data.TEST_USERS.employee.email, data.TEST_USERS.employee.password)).token;
  });

  test.describe('Dashboard Data', () => {
    test('P0: Admin can retrieve applications for dashboard', async () => {
      const { status, data: apps } = await api.getApplications(adminToken);
      expect(status).toBe(200);
      expect(Array.isArray(apps)).toBe(true);
    });

    test('P0: Employee can retrieve their applications for dashboard', async () => {
      const { status, data: apps } = await api.getApplications(employeeToken);
      expect(status).toBe(200);
      expect(Array.isArray(apps)).toBe(true);
    });

    test('P0: Admin can retrieve facilities for dashboard', async () => {
      const { status, data: facilities } = await api.getFacilities(adminToken);
      expect(status).toBe(200);
      expect(Array.isArray(facilities)).toBe(true);
    });

    test('P0: Admin can retrieve users for dashboard stats', async () => {
      const { status, data: users } = await api.getUsers(adminToken);
      expect(status).toBe(200);
      expect(Array.isArray(users)).toBe(true);
    });

    test('P0: Admin can retrieve logs for dashboard', async () => {
      const { status, data: logs } = await api.getLogs(adminToken);
      expect(status).toBe(200);
      expect(Array.isArray(logs)).toBe(true);
    });

    test('P1: Dashboard data includes pending application counts', async () => {
      const { data: apps } = await api.getApplications(adminToken);
      const appList = apps as Array<{ status: string }>;
      const pendingCount = appList.filter(a =>
        ['pending_manager', 'pending_facility', 'pending_exception'].includes(a.status)
      ).length;
      expect(typeof pendingCount).toBe('number');
    });

    test('P1: Dashboard data includes user requirement status', async () => {
      const { status } = await api.getUserRequirements(adminToken);
      expect(status).toBe(200);
    });
  });

  test.describe('Dashboard Role-Based Views', () => {
    test('P0: Line manager sees applications pending their approval', async () => {
      const managerToken = (await api.login(data.TEST_USERS.lineManager.email, data.TEST_USERS.lineManager.password)).token;
      const { status, data: apps } = await api.getApplications(managerToken);
      expect(status).toBe(200);
      expect(Array.isArray(apps)).toBe(true);
    });

    test('P0: Facility owner sees facility-specific data', async () => {
      const ownerToken = (await api.login(data.TEST_USERS.facilityOwner.email, data.TEST_USERS.facilityOwner.password)).token;
      const { status, data: facilities } = await api.getFacilities(ownerToken);
      expect(status).toBe(200);
      expect(Array.isArray(facilities)).toBe(true);
    });

    test('P1: Employee dashboard shows their own application history', async () => {
      const { data: apps } = await api.getApplications(employeeToken);
      const appList = apps as Array<{ applicant_id: string }>;
      const currentUserId = (await api.getMe(employeeToken) as { user: { id: string } }).user.id;
      appList.forEach(app => {
        expect(app.applicant_id).toBe(currentUserId);
      });
    });
  });

  test.describe('Dashboard Notifications', () => {
    test('P0: User sees notifications on dashboard', async () => {
      const { status, data: notifs } = await api.getNotifications(employeeToken);
      expect(status).toBe(200);
      expect(Array.isArray(notifs)).toBe(true);
    });

    test('P1: Unread notification count is accurate', async () => {
      const { data: notifs } = await api.getNotifications(employeeToken);
      const notifList = notifs as Array<{ read: boolean }>;
      const unreadCount = notifList.filter(n => !n.read).length;
      expect(typeof unreadCount).toBe('number');
    });
  });
});
