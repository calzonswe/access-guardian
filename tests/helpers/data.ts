const timestamp = Date.now();

export function uniqueEmail(role?: string): string {
  return `test.${role || 'user'}.${timestamp}@test.local`;
}

export function uniqueName(role?: string): string {
  return `Test ${(role || 'user').replace('_', ' ')} ${timestamp}`;
}

export function futureDate(days = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function pastDate(days = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export const VALID_PASSWORD = 'TestPassword123!';
export const SHORT_PASSWORD = 'Short1!';
export const WEAK_PASSWORD = 'password';
export const VALID_EMAIL = 'test@test.com';
export const INVALID_EMAIL = 'not-an-email';

export function base64File(name: string, content: string): string {
  return Buffer.from(content).toString('base64');
}

export const TEST_USERS: Record<string, {
  email: string;
  password: string;
  full_name: string;
  first_name: string;
  last_name: string;
}> = {
  admin: {
    email: `admin.${timestamp}@test.local`,
    password: VALID_PASSWORD,
    full_name: 'Test Admin',
    first_name: 'Test',
    last_name: 'Admin',
  },
  facilityOwner: {
    email: `owner.${timestamp}@test.local`,
    password: VALID_PASSWORD,
    full_name: 'Test Facility Owner',
    first_name: 'Test',
    last_name: 'Facility Owner',
  },
  facilityAdmin: {
    email: `facadmin.${timestamp}@test.local`,
    password: VALID_PASSWORD,
    full_name: 'Test Facility Admin',
    first_name: 'Test',
    last_name: 'Facility Admin',
  },
  lineManager: {
    email: `manager.${timestamp}@test.local`,
    password: VALID_PASSWORD,
    full_name: 'Test Line Manager',
    first_name: 'Test',
    last_name: 'Line Manager',
  },
  employee: {
    email: `employee.${timestamp}@test.local`,
    password: VALID_PASSWORD,
    full_name: 'Test Employee',
    first_name: 'Test',
    last_name: 'Employee',
  },
  contractor: {
    email: `contractor.${timestamp}@test.local`,
    password: VALID_PASSWORD,
    full_name: 'Test Contractor',
    first_name: 'Test',
    last_name: 'Contractor',
  },
};

export const ROLES = ['administrator', 'facility_owner', 'facility_admin', 'line_manager', 'employee', 'contractor'] as const;

export const REQUIREMENT_TYPES = ['certification', 'clearance', 'training'] as const;

export const APPLICATION_STATUSES = ['draft', 'pending_manager', 'pending_facility', 'pending_exception', 'approved', 'denied', 'expired'] as const;

export const SECURITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

export const LOG_ACTIONS = [
  'application_created',
  'application_approved_manager',
  'application_approved_facility',
  'application_denied',
  'exception_approved',
  'exception_denied',
  'access_granted',
  'access_revoked',
  'access_expired',
  'user_created',
  'user_updated',
  'role_assigned',
  'role_removed',
  'requirement_created',
  'requirement_fulfilled',
  'requirement_expired',
  'facility_created',
  'area_created',
  'settings_changed',
] as const;

export const NOTIFICATION_TYPES = ['info', 'warning', 'action_required'] as const;
