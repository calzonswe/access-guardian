import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('Notifications', () => {
  let adminToken: string;
  let adminUserId: string;
  let employeeToken: string;
  let employeeUserId: string;

  test.beforeAll(async () => {
    const health = await api.getHealth();
    if (health.status !== 200) {
      test.skip(true, 'Backend not available');
      return;
    }
    const admin = await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password);
    adminToken = admin.token;
    adminUserId = admin.userId;

    const emp = await api.login(data.TEST_USERS.employee.email, data.TEST_USERS.employee.password);
    employeeToken = emp.token;
    employeeUserId = emp.userId;
  });

  test.describe('Notification CRUD', () => {
    test('P0: Admin can create a notification', async () => {
      const { status, data: notif } = await api.createNotification(adminToken, {
        user_id: employeeUserId,
        title: 'Test Notification',
        message: 'This is a test notification',
        type: 'info',
      });
      expect(status).toBe(201);
      expect((notif as { title: string }).title).toBe('Test Notification');
    });

    test('P0: Admin can list all notifications', async () => {
      const { status, data: notifs } = await api.getNotifications(adminToken);
      expect(status).toBe(200);
      expect(Array.isArray(notifs)).toBe(true);
    });

    test('P0: User can list their own notifications', async () => {
      const { status, data: notifs } = await api.getNotifications(employeeToken);
      expect(status).toBe(200);
      expect(Array.isArray(notifs)).toBe(true);
    });

    test('P0: Can mark a notification as read', async () => {
      const { data: notif } = await api.createNotification(adminToken, {
        user_id: employeeUserId,
        title: 'Mark as Read Test',
        message: 'Test message',
        type: 'info',
      });
      const notifId = (notif as { id: string }).id;

      const { status } = await api.markNotificationRead(employeeToken, notifId);
      expect(status).toBe(200);
    });

    test('P0: Can mark all notifications as read', async () => {
      const { status } = await api.markAllNotificationsRead(adminToken, employeeUserId);
      expect(status).toBe(200);
    });

    test('P0: Users see only their own notifications', async () => {
      const { data: notifs } = await api.getNotifications(employeeToken);
      const notifList = notifs as Array<{ user_id: string }>;
      notifList.forEach(n => {
        expect(n.user_id).toBe(employeeUserId);
      });
    });

    test('P1: Notification can include a link', async () => {
      const { data: notif } = await api.createNotification(adminToken, {
        user_id: employeeUserId,
        title: 'Notification with Link',
        message: 'Click to view',
        type: 'action_required',
        link: '/applications',
      });
      expect((notif as { link: string }).link).toBe('/applications');
    });

    test('P1: All notification types are valid', async () => {
      for (const type of ['info', 'warning', 'action_required'] as const) {
        const { status } = await api.createNotification(adminToken, {
          user_id: employeeUserId,
          title: `${type} notification`,
          message: 'Test',
          type,
        });
        expect(status).toBe(201);
      }
    });

    test('P1: Notification created_at timestamp is set', async () => {
      const { data: notif } = await api.createNotification(adminToken, {
        user_id: employeeUserId,
        title: 'Timestamp Test',
        message: 'Test message',
        type: 'info',
      });
      expect((notif as { created_at: string }).created_at).toBeTruthy();
    });
  });

  test.describe('Notification Filtering', () => {
    test('P1: Can filter notifications by user_id', async () => {
      const { status, data: notifs } = await api.getNotifications(adminToken, employeeUserId);
      expect(status).toBe(200);
      const notifList = notifs as Array<{ user_id: string }>;
      notifList.forEach(n => {
        expect(n.user_id).toBe(employeeUserId);
      });
    });
  });
});
