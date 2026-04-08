import { test, expect } from '@playwright/test';
import * as api from './helpers/api';
import * as data from './helpers/data';

test.describe('Users Management', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    const health = await api.getHealth();
    if (health.status !== 200) {
      test.skip(true, 'Backend not available');
      return;
    }
    adminToken = (await api.login(data.TEST_USERS.admin.email, data.TEST_USERS.admin.password)).token;
  });

  test.describe('User CRUD', () => {
    test('P0: Administrator can create a new user', async () => {
      const { status, data: userData } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `create.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      expect(status).toBe(201);
      expect((userData as { email: string }).email).toBeTruthy();
    });

    test('P0: Administrator can list all users', async () => {
      const { status, data: users } = await api.getUsers(adminToken);
      expect(status).toBe(200);
      expect(Array.isArray(users)).toBe(true);
      expect((users as unknown[]).length).toBeGreaterThan(0);
    });

    test('P0: Administrator can update a user', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `update.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const userId = (newUser as { id: string }).id;

      const { status, data: updated } = await api.updateUser(adminToken, userId, {
        department: 'Engineering',
        title: 'Senior Developer',
      });
      expect(status).toBe(200);
      expect((updated as { department: string }).department).toBe('Engineering');
    });

    test('P0: Administrator can deactivate a user', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `deactivate.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const userId = (newUser as { id: string }).id;

      const { status } = await api.updateUser(adminToken, userId, { is_active: false });
      expect(status).toBe(200);
    });

    test('P0: Administrator can delete a user', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `delete.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const userId = (newUser as { id: string }).id;

      const { status } = await api.deleteUser(adminToken, userId);
      expect(status).toBe(204);
    });

    test('P0: Deleted user cannot log in', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `login-after-delete.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const userId = (newUser as { id: string }).id;
      const email = (newUser as { email: string }).email;
      await api.deleteUser(adminToken, userId);

      const { status } = await api.login(email, data.VALID_PASSWORD);
      expect(status).toBe(401);
    });

    test('P0: User can read their own profile', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `read-self.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const email = (newUser as { email: string }).email;
      const login = await api.login(email, data.VALID_PASSWORD);

      const { status, data: meData } = await api.getMe(login.token);
      expect(status).toBe(200);
      expect((meData as { user: { email: string } }).user.email).toBe(email);
    });

    test('P1: Cannot create user with duplicate email', async () => {
      const email = `duplicate.${Date.now()}@test.local`;
      await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email,
        roles: ['employee'],
      });

      const { status } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email,
        roles: ['employee'],
      });
      expect(status).toBe(409);
    });

    test('P1: User roles are returned in user data', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.lineManager,
        email: `roles.${Date.now()}@test.local`,
        roles: ['line_manager'],
      });
      const login = await api.login((newUser as { email: string }).email, data.VALID_PASSWORD);

      const { data: meData } = await api.getMe(login.token);
      expect((meData as { user: { roles: string[] } }).user.roles).toContain('line_manager');
    });

    test('P1: Administrator can assign multiple roles to a user', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.facilityAdmin,
        email: `multi-role.${Date.now()}@test.local`,
        roles: ['facility_admin', 'employee'],
      });
      const userId = (newUser as { id: string }).id;
      const login = await api.login((newUser as { email: string }).email, data.VALID_PASSWORD);

      const { data: meData } = await api.getMe(login.token);
      const roles = (meData as { user: { roles: string[] } }).user.roles;
      expect(roles).toContain('facility_admin');
      expect(roles).toContain('employee');
    });

    test('P1: User with no roles cannot perform any authenticated action', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `no-role.${Date.now()}@test.local`,
        roles: [],
      });
      const login = await api.login((newUser as { email: string }).email, data.VALID_PASSWORD);

      const { status } = await api.getFacilities(login.token);
      expect(status).toBe(403);
    });

    test('P2: Password is not returned in user responses', async () => {
      const { data: meData } = await api.getMe(adminToken);
      expect(meData).not.toHaveProperty('password');
      expect(meData).not.toHaveProperty('password_hash');
    });

    test('P2: must_change_password flag is set for new users', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `pwd-flag.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const login = await api.login((newUser as { email: string }).email, data.VALID_PASSWORD);
      const { data: meData } = await api.getMe(login.token);

      expect((meData as { mustChangePassword: boolean }).mustChangePassword).toBe(true);
    });

    test('P2: Password change clears must_change_password flag', async () => {
      const { data: newUser } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `pwd-clear.${Date.now()}@test.local`,
        roles: ['employee'],
      });
      const login = await api.login((newUser as { email: string }).email, data.VALID_PASSWORD);

      await api.changePassword(login.token, 'NewPassword789!');

      const { data: meData } = await api.getMe(login.token);
      expect((meData as { mustChangePassword: boolean }).mustChangePassword).toBe(false);
    });
  });

  test.describe('User Validation', () => {
    test('P1: Cannot create user with invalid email', async () => {
      const { status } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: 'not-an-email',
        roles: ['employee'],
      });
      expect(status).toBe(400);
    });

    test('P1: Cannot create user with short password', async () => {
      const { status } = await api.createUser(adminToken, {
        ...data.TEST_USERS.employee,
        email: `short-pw.${Date.now()}@test.local`,
        password: 'short',
        roles: ['employee'],
      });
      expect(status).toBe(400);
    });

    test('P1: User full_name is required', async () => {
      const { status } = await api.createUser(adminToken, {
        email: `noname.${Date.now()}@test.local`,
        password: data.VALID_PASSWORD,
        full_name: '',
        roles: ['employee'],
      });
      expect(status).toBe(400);
    });
  });
});
