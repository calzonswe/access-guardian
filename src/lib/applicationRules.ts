/**
 * Application rules shared by the UI (inbox count, buttons, access lists).
 * They mirror the backend's TRANSITIONS table; the backend always has the
 * final say, these only decide what to show.
 */
import type { Application, ApplicationStatus, Facility, User } from '@/types/rbac';

export interface RuleContext {
  facility?: Facility;
  applicant?: User;
  /** Ids of users this user manages (whole chain below them). */
  managedIds?: string[];
  /** Managers this user currently stands in for as substitute. */
  substituteFor?: string[];
}

const PENDING = ['pending_manager', 'pending_facility', 'pending_exception'];

/** Local calendar date 'YYYY-MM-DD'. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Can `user` approve or deny `app` in its current status? */
export function canActOn(app: Application, user: User, ctx: RuleContext = {}): boolean {
  if (!PENDING.includes(app.status)) return false;
  if (app.applicant_id === user.id) return false;
  if (user.roles.includes('administrator')) return true;
  const { facility, applicant } = ctx;
  if (app.status === 'pending_manager') {
    if (!applicant) return false;
    return applicant.manager_id === user.id
      || applicant.contact_person_id === user.id
      || (user.roles.includes('line_manager') && (ctx.managedIds || []).includes(applicant.id))
      || (!!applicant.manager_id && (ctx.substituteFor || []).includes(applicant.manager_id));
  }
  if (!facility) return false;
  const isOwner = facility.owner_id === user.id;
  if (app.status === 'pending_exception') return isOwner;
  return isOwner || (facility.admin_ids || []).includes(user.id);
}

/** Days from `today` to the date string `day` (negative when in the past). */
function daysUntil(day: string, today: Date): number {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((target - base) / 86400000);
}

/** "Förläng": own approved access ending within 60 days, or expired without being revoked. */
export function canRenew(app: Application, user: User, today: Date = new Date()): boolean {
  if (app.applicant_id !== user.id || !app.end_date) return false;
  if (app.status === 'expired') return !app.revoked_at;
  if (app.status === 'approved') return daysUntil(app.end_date, today) <= 60;
  return false;
}

/** Approved access to `facilityId` that is valid today. */
export function activeAccessFor(apps: Application[], facilityId: string, today: Date = new Date()): Application[] {
  const t = isoDay(today);
  return apps.filter(a =>
    a.facility_id === facilityId
    && a.status === 'approved'
    && a.start_date.slice(0, 10) <= t
    && (!a.end_date || a.end_date.slice(0, 10) >= t));
}

/** Days until access ends (null when open-ended). */
export function daysLeft(app: Application, today: Date = new Date()): number | null {
  return app.end_date ? daysUntil(app.end_date, today) : null;
}

/** Start date for a renewal: the day after the old end date, or today if that is later. */
export function renewalStartDate(app: Application, today: Date = new Date()): string {
  const t = isoDay(today);
  if (!app.end_date) return t;
  const [y, m, d] = app.end_date.slice(0, 10).split('-').map(Number);
  const next = isoDay(new Date(y, m - 1, d + 1));
  return next > t ? next : t;
}

/** The status an approval moves an application to (null when there is nothing to approve). */
export function nextApproveStatus(app: Application): ApplicationStatus | null {
  if (app.status === 'pending_manager') return app.has_exception ? 'pending_exception' : 'pending_facility';
  if (app.status === 'pending_facility' || app.status === 'pending_exception') return 'approved';
  return null;
}
