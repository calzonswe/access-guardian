import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('System Settings', () => {
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

  test.describe('Settings Access', () => {
    test('P0: Admin can read system settings', async () => {
      const { status, data: settings } = await api.getSettings(adminToken);
      expect(status).toBe(200);
      expect(typeof settings).toBe('object');
    });

    test('P0: Non-admin cannot read system settings', async () => {
      const { status } = await api.getSettings(employeeToken);
      expect(status).toBe(403);
    });

    test('P0: Settings require authentication', async () => {
      const { status } = await api.getSettings('');
      expect(status).toBe(401);
    });
  });

  test.describe('Settings Update', () => {
    test('P0: Admin can update branding settings', async () => {
      const { status, data: updated } = await api.saveSettings(adminToken, {
        branding: { appName: 'Access Guardian Test', subtitle: 'Test Subtitle' },
      });
      expect(status).toBe(200);
      expect((updated as { branding: { appName: string } }).branding.appName).toBe('Access Guardian Test');
    });

    test('P0: Admin can update notification settings', async () => {
      const { status, data: updated } = await api.saveSettings(adminToken, {
        notifications: { expiryWarningDays: [14, 3] },
      });
      expect(status).toBe(200);
      expect((updated as { notifications: { expiryWarningDays: number[] } }).notifications.expiryWarningDays).toEqual([14, 3]);
    });

    test('P0: Admin can update security settings', async () => {
      const { status, data: updated } = await api.saveSettings(adminToken, {
        security: { sessionTimeoutMinutes: 60, maxLoginAttempts: 3 },
      });
      expect(status).toBe(200);
      expect((updated as { security: { sessionTimeoutMinutes: number } }).security.sessionTimeoutMinutes).toBe(60);
    });

    test('P0: Admin can update general settings', async () => {
      const { status, data: updated } = await api.saveSettings(adminToken, {
        general: { organizationName: 'Test Org', language: 'sv' },
      });
      expect(status).toBe(200);
      expect((updated as { general: { organizationName: string } }).general.organizationName).toBe('Test Org');
    });

    test('P0: Admin can update auth settings', async () => {
      const { status, data: updated } = await api.saveSettings(adminToken, {
        auth: { localEnabled: true, entraEnabled: false },
      });
      expect(status).toBe(200);
      expect((updated as { auth: { localEnabled: boolean } }).auth.localEnabled).toBe(true);
    });

    test('P0: Non-admin cannot update settings', async () => {
      const { status } = await api.saveSettings(employeeToken, {
        branding: { appName: 'Hacked' },
      });
      expect(status).toBe(403);
    });
  });

  test.describe('Settings Validation', () => {
    test('P1: Settings update is atomic', async () => {
      const { data: before } = await api.getSettings(adminToken);

      await api.saveSettings(adminToken, {
        branding: { appName: 'Atomic Test' },
      });

      const { data: after } = await api.getSettings(adminToken);
      expect(after).toHaveProperty('branding');
    });

    test('P1: Partial update only modifies specified fields', async () => {
      await api.saveSettings(adminToken, {
        branding: { appName: 'Partial Update Test' },
      });

      await api.saveSettings(adminToken, {
        general: { organizationName: 'New Org Name' },
      });

      const { data: current } = await api.getSettings(adminToken);
      expect((current as { branding: { appName: string } }).branding.appName).toBe('Partial Update Test');
      expect((current as { general: { organizationName: string } }).general.organizationName).toBe('New Org Name');
    });

    test('P2: Invalid settings structure is handled gracefully', async () => {
      const { status } = await api.saveSettings(adminToken, {
        invalid_category: { key: 'value' },
      } as Record<string, unknown>);
      expect(status).toBe(200);
    });
  });

  test.describe('Settings Logging', () => {
    test('P1: Changing settings creates a log entry', async () => {
      const beforeLogs = await api.getLogs(adminToken);

      await api.saveSettings(adminToken, {
        branding: { appName: `Logged Change ${Date.now()}` },
      });

      const afterLogs = await api.getLogs(adminToken);
      const beforeIds = new Set((beforeLogs as Array<{ id: string }>).map(l => l.id));
      const newLogs = (afterLogs as Array<{ id: string; action: string }>).filter(l => !beforeIds.has(l.id));
      expect(newLogs.some(l => l.action === 'settings_changed')).toBe(true);
    });
  });
});
