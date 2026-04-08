import { test as base, Page, APIRequestContext } from '@playwright/test';
import * as api from './helpers/api';

export interface TestUser {
  email: string;
  password: string;
  roles: string[];
}

export interface AuthFixtures {
  admin: TestUser;
  facilityOwner: TestUser;
  facilityAdmin: TestUser;
  lineManager: TestUser;
  employee: TestUser;
  contractor: TestUser;
  unauthenticated: TestUser;
  api: typeof api;
  page: Page;
  apiContext: APIRequestContext;
}

export const test = base.extend<AuthFixtures>({
  admin: { email: 'admin@company.local', password: 'Admin123!', roles: ['administrator'] },
  facilityOwner: { email: 'owner@company.local', password: 'Owner123!', roles: ['facility_owner'] },
  facilityAdmin: { email: 'facilityadmin@company.local', password: 'FacilityAdmin123!', roles: ['facility_admin'] },
  lineManager: { email: 'manager@company.local', password: 'Manager123!', roles: ['line_manager'] },
  employee: { email: 'employee@company.local', password: 'Employee123!', roles: ['employee'] },
  contractor: { email: 'contractor@company.local', password: 'Contractor123!', roles: ['contractor'] },
  unauthenticated: { email: '', password: '', roles: [] },
  api: api,
  apiContext: async ({}, use) => {
    const ctx = await api.getApiContext();
    await use(ctx);
  },
});

export { expect } from '@playwright/test';
