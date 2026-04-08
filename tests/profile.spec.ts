import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('Profile', () => {
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

  test.describe('Profile Read', () => {
    test('P0: GET /auth/me returns current user profile', async () => {
      const { status, data: meData } = await api.getMe(adminToken);
      expect(status).toBe(200);
      expect((meData as { user: { id: string } }).user.id).toBe(adminUserId);
    });

    test('P0: Profile includes roles', async () => {
      const { data: meData } = await api.getMe(adminToken);
      expect((meData as { user: { roles: string[] } }).user.roles).toContain('administrator');
    });

    test('P0: Profile includes email', async () => {
      const { data: meData } = await api.getMe(employeeToken);
      expect((meData as { user: { email: string } }).user.email).toBeTruthy();
    });

    test('P0: Profile includes mustChangePassword flag', async () => {
      const { data: meData } = await api.getMe(employeeToken);
      expect(typeof (meData as { mustChangePassword: boolean }).mustChangePassword).toBe('boolean');
    });

    test('P1: Profile includes department and title', async () => {
      const { data: meData } = await api.getMe(employeeToken);
      const profile = meData as { user: { department?: string; title?: string } };
      expect(profile.user).toHaveProperty('department');
      expect(profile.user).toHaveProperty('title');
    });

    test('P1: Profile includes phone', async () => {
      const { data: meData } = await api.getMe(employeeToken);
      const profile = meData as { user: { phone?: string } };
      expect(profile.user).toHaveProperty('phone');
    });

    test('P2: Profile does not include password hash', async () => {
      const { data: meData } = await api.getMe(adminToken);
      expect(meData).not.toHaveProperty('password_hash');
      expect(meData).not.toHaveProperty('password');
    });
  });

  test.describe('Password Change', () => {
    test('P0: User can change their own password', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `pwchange.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const email = (newUser as { email: string }).email;
      const login = await api.login(email, data.VALID_PASSWORD);

      const { status } = await api.changePassword(login.token, 'NewPassword999!');
      expect(status).toBe(200);
    });

    test('P0: Cannot change password without current session', async () => {
      const { status } = await api.changePassword('', 'NewPassword999!');
      expect(status).toBe(401);
    });

    test('P1: New password must meet minimum length', async () => {
      const { status } = await api.changePassword(adminToken, 'short');
      expect(status).toBe(400);
    });

    test('P1: After password change, mustChangePassword is false', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `pwdreset.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const email = (newUser as { email: string }).email;
      const login = await api.login(email, data.VALID_PASSWORD);

      await api.changePassword(login.token, 'NewPassword999!');

      const { data: meData } = await api.getMe(login.token);
      expect((meData as { mustChangePassword: boolean }).mustChangePassword).toBe(false);
    });
  });

  test.describe('Profile Update', () => {
    test('P1: Admin can update any user profile via PUT /users/:id', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `profile-update.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const userId = (newUser as { id: string }).id;

      const { status } = await api.updateUser(adminToken, userId, {
        phone: '+46 70 123 4567',
        department: 'HR',
        title: 'HR Manager',
      });
      expect(status).toBe(200);
    });

    test('P1: User cannot update another user\'s profile', async () => {
      const { data: targetUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `target-user.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const targetId = (targetUser as { id: string }).id;

      const { status } = await api.updateUser(employeeToken, targetId, {
        department: 'Hacked',
      });
      expect(status).toBe(403);
    });

    test('P2: Phone number can be updated', async () => {
      const { status } = await api.updateUser(adminToken, adminUserId, {
        phone: '+46 70 987 6543',
      });
      expect(status).toBe(200);
    });
  });
});
