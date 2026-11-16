import { describe, it, expect } from 'vitest';
import { canActOn, canRenew, activeAccessFor } from '@/lib/applicationRules';
import type { Application, Facility, User } from '@/types/rbac';

const user = (id: string, roles: User['roles'], extra: Partial<User> = {}): User =>
  ({ id, email: `${id}@x.se`, full_name: id, first_name: id, last_name: '', roles, is_active: true, created_at: '', ...extra });
const app = (extra: Partial<Application> = {}): Application => ({
  id: 'a1', applicant_id: 'emp', facility_id: 'f1', area_ids: [], status: 'pending_manager',
  start_date: '2026-12-01', has_exception: false, attachments: [], created_at: '', updated_at: '', ...extra,
});
const facility: Facility = { id: 'f1', name: 'F', description: '', address: '', owner_id: 'owner', admin_ids: ['fadmin'], created_at: '' };
const applicant = user('emp', ['employee'], { manager_id: 'boss' });

describe('canActOn', () => {
  it('never lets the applicant act on their own application', () => {
    expect(canActOn(app(), user('emp', ['employee', 'line_manager']), { applicant, facility })).toBe(false);
  });
  it('lets the manager, a substitute and an admin act at the manager step', () => {
    expect(canActOn(app(), user('boss', ['line_manager']), { applicant, facility })).toBe(true);
    expect(canActOn(app(), user('sub', ['line_manager']), { applicant, facility, substituteFor: ['boss'] })).toBe(true);
    expect(canActOn(app(), user('admin', ['administrator']), { applicant, facility })).toBe(true);
    expect(canActOn(app(), user('other', ['line_manager']), { applicant, facility })).toBe(false);
  });
  it('lets only the owner decide exceptions, staff decide the facility step', () => {
    const exc = app({ status: 'pending_exception', has_exception: true });
    expect(canActOn(exc, user('fadmin', ['facility_admin']), { applicant, facility })).toBe(false);
    expect(canActOn(exc, user('owner', ['facility_owner']), { applicant, facility })).toBe(true);
    expect(canActOn(app({ status: 'pending_facility' }), user('fadmin', ['facility_admin']), { applicant, facility })).toBe(true);
  });
  it('is false for non-pending statuses', () => {
    expect(canActOn(app({ status: 'approved' }), user('admin', ['administrator']), { applicant, facility })).toBe(false);
  });
});

describe('canRenew', () => {
  const today = new Date('2026-11-16T12:00:00');
  const me = user('emp', ['employee']);
  it('offers renewal for own approved access ending within 60 days', () => {
    expect(canRenew(app({ status: 'approved', end_date: '2026-12-16' }), me, today)).toBe(true);
    expect(canRenew(app({ status: 'approved', end_date: '2027-03-01' }), me, today)).toBe(false);
    expect(canRenew(app({ status: 'approved' }), me, today)).toBe(false);
  });
  it('offers renewal for expired but not revoked access', () => {
    expect(canRenew(app({ status: 'expired', end_date: '2026-10-01' }), me, today)).toBe(true);
    expect(canRenew(app({ status: 'expired', end_date: '2027-01-01', revoked_at: '2026-11-01' }), me, today)).toBe(false);
  });
  it('is only for the applicant', () => {
    expect(canRenew(app({ status: 'approved', end_date: '2026-12-01' }), user('boss', ['line_manager']), today)).toBe(false);
  });
});

describe('activeAccessFor', () => {
  const today = new Date('2026-11-16T12:00:00');
  it('keeps approved access valid today', () => {
    const apps = [
      app({ id: 'ok', status: 'approved', start_date: '2026-11-01', end_date: '2026-11-16' }),
      app({ id: 'open', status: 'approved', start_date: '2026-01-01' }),
      app({ id: 'future', status: 'approved', start_date: '2026-11-17' }),
      app({ id: 'ended', status: 'approved', start_date: '2026-01-01', end_date: '2026-11-15' }),
      app({ id: 'pending', status: 'pending_facility', start_date: '2026-01-01' }),
      app({ id: 'other', status: 'approved', facility_id: 'f2', start_date: '2026-01-01' }),
    ];
    expect(activeAccessFor(apps, 'f1', today).map(a => a.id)).toEqual(['ok', 'open']);
  });
});
