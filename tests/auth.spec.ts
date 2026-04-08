import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('Authentication', () => {
  test.beforeEach(async () => {
    const health = await api.getHealth();
    if (health.status !== 200) {
      test.skip(true, 'Backend not available');
    }
  });

  test.describe('Login', () => {
    test('P0: Successful login with valid credentials returns token and user data', async () => {
      const res = await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password);
      expect(res.token).toBeTruthy();
      expect(res.userId).toBeTruthy();
      expect(res.roles).toContain('administrator');
    });

    test('P0: Login fails with incorrect password', async () => {
      const { status, data: errData } = await api.login(data.TEST_USERS.admin.email, 'WrongPassword123!');
      expect(status).toBe(401);
      expect(errData).toHaveProperty('error');
    });

    test('P0: Login fails with non-existent email', async () => {
      const { status } = await api.login('nonexistent@test.local', 'SomePassword123!');
      expect(status).toBe(401);
    });

    test('P0: Login fails with empty credentials', async () => {
      const { status } = await api.login('', '');
      expect(status).toBe(400);
    });

    test('P0: Login fails with invalid email format', async () => {
      const { status } = await api.login('not-an-email', 'SomePassword123!');
      expect(status).toBe(400);
    });

    test('P0: Login fails for inactive user', async () => {
      const { status } = await api.login('inactive@test.local', 'SomePassword123!');
      expect(status).toBe(401);
    });

    test('P1: Login is case-insensitive for email', async () => {
      const res = await api.login(
        data.TEST_USERS.admin.email.toUpperCase(),
        data.TEST_USERS.admin.password
      );
      expect(res.token).toBeTruthy();
    });

    test('P1: Password must be at least 8 characters on change-password', async () => {
      const login = await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password);
      const { status } = await api.changePassword(login.token, 'Short1!');
      expect(status).toBe(400);
    });

    test('P1: Successful password change returns new token', async () => {
      const login = await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password);
      const { status, data: body } = await api.changePassword(login.token, 'NewPassword456!');
      expect(status).toBe(200);
      expect((body as { token: string }).token).toBeTruthy();
    });

    test('P2: Login requires email field', async () => {
      const { status } = await api.apiRequest('post', '/auth/login', { password: 'test' });
      expect(status).toBe(400);
    });

    test('P2: Login requires password field', async () => {
      const { status } = await api.apiRequest('post', '/auth/login', { email: 'test@test.com' });
      expect(status).toBe(400);
    });

    test('P2: GET /auth/me returns current user with valid token', async () => {
      const login = await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password);
      const { status, data: body } = await api.getMe(login.token);
      expect(status).toBe(200);
      expect((body as { user: unknown }).user).toBeTruthy();
    });

    test('P2: GET /auth/me fails without token', async () => {
      const { status } = await api.getMe('');
      expect(status).toBe(401);
    });

    test('P2: GET /auth/me fails with invalid token', async () => {
      const { status } = await api.getMe('invalid-token');
      expect(status).toBe(401);
    });

    test('P2: GET /auth/me fails with expired/invalid JWT format', async () => {
      const { status } = await api.getMe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
      expect(status).toBe(401);
    });
  });

  test.describe('Rate Limiting', () => {
    test('P1: Login is rate-limited after too many attempts from same IP', async ({ page }) => {
      const ip = '10.0.0.1';
      for (let i = 0; i < 10; i++) {
        await api.login(`user${i}@test.local`, 'wrongpassword');
      }
      const { status, data: errData } = await api.login('another@test.local', 'wrongpassword');
      expect(status).toBe(429);
      expect(errData).toHaveProperty('error');
    });
  });
});
