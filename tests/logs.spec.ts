import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('System Logs', () => {
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

  test.describe('Log Access', () => {
    test('P0: Admin can access system logs', async () => {
      const { status, data: logs } = await api.getLogs(adminToken);
      expect(status).toBe(200);
      expect(Array.isArray(logs)).toBe(true);
    });

    test('P0: Non-admin cannot access system logs', async () => {
      const { status } = await api.getLogs(employeeToken);
      expect(status).toBe(403);
    });

    test('P0: Logs require authentication', async () => {
      const { status } = await api.getLogs('');
      expect(status).toBe(401);
    });
  });

  test.describe('Log Content', () => {
    test('P1: Log entries have required fields', async () => {
      const { data: logs } = await api.getLogs(adminToken);
      if ((logs as unknown[]).length === 0) {
        test.skip(true, 'No logs available');
        return;
      }
      const logEntry = (logs as unknown[])[0] as Record<string, unknown>;
      expect(logEntry).toHaveProperty('id');
      expect(logEntry).toHaveProperty('action');
      expect(logEntry).toHaveProperty('actor_id');
      expect(logEntry).toHaveProperty('created_at');
    });

    test('P1: Log action is a valid enum value', async () => {
      const { data: logs } = await api.getLogs(adminToken);
      const logList = logs as Array<{ action: string }>;
      if (logList.length === 0) {
        test.skip(true, 'No logs available');
        return;
      }
      logList.forEach(log => {
        expect(data.LOG_ACTIONS).toContain(log.action);
      });
    });

    test('P2: Logs are ordered by created_at descending', async () => {
      const { data: logs } = await api.getLogs(adminToken);
      const logList = logs as Array<{ created_at: string }>;
      if (logList.length < 2) {
        test.skip(true, 'Not enough logs');
        return;
      }
      for (let i = 0; i < logList.length - 1; i++) {
        expect(new Date(logList[i].created_at).getTime()).toBeGreaterThanOrEqual(
          new Date(logList[i + 1].created_at).getTime()
        );
      }
    });
  });

  test.describe('Log Filtering', () => {
    test('P1: Can filter logs by action type', async () => {
      const { status } = await api.getLogs(adminToken, { action: 'user_created' });
      expect(status).toBe(200);
    });

    test('P1: Can filter logs by actor name', async () => {
      const { status } = await api.getLogs(adminToken, { actor_name: 'admin' });
      expect(status).toBe(200);
    });

    test('P1: Can filter logs by details text', async () => {
      const { status } = await api.getLogs(adminToken, { details: 'test' });
      expect(status).toBe(200);
    });

    test('P2: Filters can be combined', async () => {
      const { status } = await api.getLogs(adminToken, {
        action: 'user_created',
        actor_name: 'admin',
      });
      expect(status).toBe(200);
    });
  });

  test.describe('Log Immutability', () => {
    test('P1: Cannot create log entry via API with forged actor_id', async () => {
      const { status } = await api.apiRequest('post', '/logs', {
        action: 'user_created',
        actor_id: 'forged-id-00000000',
        details: 'Forged log',
      }, employeeToken);
      expect(status).toBe(403);
    });

    test('P1: Cannot delete logs', async () => {
      const { status } = await api.apiRequest('delete', '/logs', undefined, adminToken);
      expect(status).toBe(404);
    });
  });

  test.describe('Log Pagination', () => {
    test('P2: Logs endpoint returns paginated results', async () => {
      const { data: logs } = await api.getLogs(adminToken);
      expect(Array.isArray(logs)).toBe(true);
    });
  });
});
