import type { User, Facility, Area, Requirement, Application, SystemLog, Notification, UserRequirement, FacilityRequirement } from '@/types/rbac';
import type { OrgNode } from '@/types/organization';
import { hashPassword, verifyPassword } from '@/services/crypto';
import type { OrgNode } from '@/types/organization';

export interface StoredUser extends User {
  password: string;
  must_change_password: boolean;
}

const KEYS = {
  USERS: 'rbac_users',
  FACILITIES: 'rbac_facilities',
  AREAS: 'rbac_areas',
  REQUIREMENTS: 'rbac_requirements',
  APPLICATIONS: 'rbac_applications',
  USER_REQUIREMENTS: 'rbac_user_requirements',
  LOGS: 'rbac_logs',
  NOTIFICATIONS: 'rbac_notifications',
  ORG_TREE: 'rbac_org_tree',
  SESSION: 'rbac_session',
};

function uid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function get<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function set<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

async function initIfNeeded(): Promise<void> {
  const users = get<StoredUser>(KEYS.USERS);
  if (users.length > 0) return;

  const hashedPw = await hashPassword('Admin123!');
  const adminUser: StoredUser = {
    id: uid(),
    email: 'admin@company.local',
    full_name: 'Systemadministratör',
    first_name: 'System',
    last_name: 'Administratör',
    roles: ['administrator'],
    department: 'IT',
    is_active: true,
    created_at: now(),
    password: hashedPw,
    must_change_password: true,
  };

  set(KEYS.USERS, [adminUser]);
  set(KEYS.FACILITIES, []);
  set(KEYS.AREAS, []);
  set(KEYS.REQUIREMENTS, []);
  set(KEYS.APPLICATIONS, []);
  set(KEYS.USER_REQUIREMENTS, []);
  set(KEYS.LOGS, []);
  set(KEYS.NOTIFICATIONS, []);
  set(KEYS.ORG_TREE, []);

  addLog({
    action: 'user_created',
    actor_id: adminUser.id,
    target_id: adminUser.id,
    target_type: 'user',
    details: 'Standardadministratör skapad vid systeminitiering',
  });
}

// Initialize on module load
export const initPromise = initIfNeeded();

// ============= AUTH =============

export async function authenticate(email: string, password: string): Promise<StoredUser | null> {
  const users = get<StoredUser>(KEYS.USERS);
  for (const u of users) {
    if (u.email.toLowerCase() === email.toLowerCase() && u.is_active) {
      const match = await verifyPassword(password, u.password);
      if (match) return u;
    }
  }
  return null;
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const users = get<StoredUser>(KEYS.USERS);
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return;
  users[idx].password = await hashPassword(newPassword);
  users[idx].must_change_password = false;
  set(KEYS.USERS, users);
}

export function getSession(): StoredUser | null {
  try {
    const data = localStorage.getItem(KEYS.SESSION);
    if (!data) return null;
    const session = JSON.parse(data);
    // Verify user still exists and is active
    const users = get<StoredUser>(KEYS.USERS);
    return users.find(u => u.id === session.id && u.is_active) || null;
  } catch {
    return null;
  }
}

export function setSession(user: StoredUser): void {
  localStorage.setItem(KEYS.SESSION, JSON.stringify({ id: user.id }));
}

export function clearSession(): void {
  localStorage.removeItem(KEYS.SESSION);
}

// ============= USERS =============

export function getUsers(): User[] {
  return get<StoredUser>(KEYS.USERS).map(({ password, must_change_password, ...u }) => u);
}

export function getStoredUsers(): StoredUser[] {
  return get<StoredUser>(KEYS.USERS);
}

export function getUser(id: string): User | undefined {
  const users = getUsers();
  return users.find(u => u.id === id);
}

export function getStoredUser(id: string): StoredUser | undefined {
  return get<StoredUser>(KEYS.USERS).find(u => u.id === id);
}

export function createUser(data: Omit<User, 'id' | 'created_at'> & { password: string }): User {
  const users = get<StoredUser>(KEYS.USERS);
  const newUser: StoredUser = {
    ...data,
    id: uid(),
    created_at: now(),
    must_change_password: true,
  };
  users.push(newUser);
  set(KEYS.USERS, users);
  return toPublicUser(newUser);
}

export function updateUser(id: string, data: Partial<Omit<StoredUser, 'id' | 'created_at'>>): User | undefined {
  const users = get<StoredUser>(KEYS.USERS);
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return undefined;
  users[idx] = { ...users[idx], ...data };
  set(KEYS.USERS, users);
  return toPublicUser(users[idx]);
}

export function deleteUser(id: string): void {
  const users = get<StoredUser>(KEYS.USERS);
  set(KEYS.USERS, users.filter(u => u.id !== id));
}

function toPublicUser(u: StoredUser): User {
  const { password, must_change_password, ...pub } = u;
  return pub;
}

// ============= FACILITIES =============

export function getFacilities(): Facility[] {
  return get<Facility>(KEYS.FACILITIES);
}

export function getFacility(id: string): Facility | undefined {
  return getFacilities().find(f => f.id === id);
}

export function createFacility(data: Omit<Facility, 'id' | 'created_at'>): Facility {
  const items = get<Facility>(KEYS.FACILITIES);
  const item: Facility = { ...data, id: uid(), created_at: now() };
  items.push(item);
  set(KEYS.FACILITIES, items);
  return item;
}

export function updateFacility(id: string, data: Partial<Omit<Facility, 'id' | 'created_at'>>): Facility | undefined {
  const items = get<Facility>(KEYS.FACILITIES);
  const idx = items.findIndex(f => f.id === id);
  if (idx === -1) return undefined;
  items[idx] = { ...items[idx], ...data };
  set(KEYS.FACILITIES, items);
  return items[idx];
}

export function deleteFacility(id: string): void {
  set(KEYS.FACILITIES, get<Facility>(KEYS.FACILITIES).filter(f => f.id !== id));
  // Also delete areas in this facility
  set(KEYS.AREAS, get<Area>(KEYS.AREAS).filter(a => a.facility_id !== id));
}

// ============= AREAS =============

export function getAreas(facilityId?: string): Area[] {
  const areas = get<Area>(KEYS.AREAS);
  return facilityId ? areas.filter(a => a.facility_id === facilityId) : areas;
}

export function getArea(id: string): Area | undefined {
  return get<Area>(KEYS.AREAS).find(a => a.id === id);
}

export function createArea(data: Omit<Area, 'id' | 'created_at'>): Area {
  const items = get<Area>(KEYS.AREAS);
  const item: Area = { ...data, id: uid(), created_at: now() };
  items.push(item);
  set(KEYS.AREAS, items);
  return item;
}

export function updateArea(id: string, data: Partial<Omit<Area, 'id' | 'created_at'>>): Area | undefined {
  const items = get<Area>(KEYS.AREAS);
  const idx = items.findIndex(a => a.id === id);
  if (idx === -1) return undefined;
  items[idx] = { ...items[idx], ...data };
  set(KEYS.AREAS, items);
  return items[idx];
}

export function deleteArea(id: string): void {
  set(KEYS.AREAS, get<Area>(KEYS.AREAS).filter(a => a.id !== id));
}

// ============= REQUIREMENTS =============

export function getRequirements(): Requirement[] {
  return get<Requirement>(KEYS.REQUIREMENTS);
}

export function getRequirement(id: string): Requirement | undefined {
  return getRequirements().find(r => r.id === id);
}

export function createRequirement(data: Omit<Requirement, 'id'>): Requirement {
  const items = get<Requirement>(KEYS.REQUIREMENTS);
  const item: Requirement = { ...data, id: uid() };
  items.push(item);
  set(KEYS.REQUIREMENTS, items);
  return item;
}

export function updateRequirement(id: string, data: Partial<Omit<Requirement, 'id'>>): Requirement | undefined {
  const items = get<Requirement>(KEYS.REQUIREMENTS);
  const idx = items.findIndex(r => r.id === id);
  if (idx === -1) return undefined;
  items[idx] = { ...items[idx], ...data };
  set(KEYS.REQUIREMENTS, items);
  return items[idx];
}

export function deleteRequirement(id: string): void {
  set(KEYS.REQUIREMENTS, get<Requirement>(KEYS.REQUIREMENTS).filter(r => r.id !== id));
}

// ============= FACILITY REQUIREMENTS =============

export function getFacilityRequirements(facilityId?: string): FacilityRequirement[] {
  const items = get<FacilityRequirement>('rbac_facility_requirements');
  return facilityId ? items.filter(fr => fr.facility_id === facilityId) : items;
}

export function addFacilityRequirement(facilityId: string, requirementId: string): FacilityRequirement {
  const items = get<FacilityRequirement>('rbac_facility_requirements');
  const existing = items.find(fr => fr.facility_id === facilityId && fr.requirement_id === requirementId);
  if (existing) return existing;
  const item: FacilityRequirement = { id: uid(), facility_id: facilityId, requirement_id: requirementId };
  items.push(item);
  set('rbac_facility_requirements', items);
  return item;
}

export function removeFacilityRequirement(facilityId: string, requirementId: string): void {
  const items = get<FacilityRequirement>('rbac_facility_requirements');
  set('rbac_facility_requirements', items.filter(fr => !(fr.facility_id === facilityId && fr.requirement_id === requirementId)));
}

// ============= APPLICATIONS =============

export function getApplications(): Application[] {
  return get<Application>(KEYS.APPLICATIONS);
}

export function getApplication(id: string): Application | undefined {
  return getApplications().find(a => a.id === id);
}

export function createApplication(data: Omit<Application, 'id' | 'created_at' | 'updated_at'>): Application {
  const items = get<Application>(KEYS.APPLICATIONS);
  const item: Application = { ...data, id: uid(), created_at: now(), updated_at: now() };
  items.push(item);
  set(KEYS.APPLICATIONS, items);
  return item;
}

export function updateApplication(id: string, data: Partial<Omit<Application, 'id' | 'created_at'>>): Application | undefined {
  const items = get<Application>(KEYS.APPLICATIONS);
  const idx = items.findIndex(a => a.id === id);
  if (idx === -1) return undefined;
  items[idx] = { ...items[idx], ...data, updated_at: now() };
  set(KEYS.APPLICATIONS, items);
  return items[idx];
}

export function deleteApplication(id: string): void {
  set(KEYS.APPLICATIONS, get<Application>(KEYS.APPLICATIONS).filter(a => a.id !== id));
}

// ============= USER REQUIREMENTS =============

export function getUserRequirements(userId?: string): UserRequirement[] {
  const items = get<UserRequirement>(KEYS.USER_REQUIREMENTS);
  return userId ? items.filter(ur => ur.user_id === userId) : items;
}

export function createUserRequirement(data: Omit<UserRequirement, 'id'>): UserRequirement {
  const items = get<UserRequirement>(KEYS.USER_REQUIREMENTS);
  const item: UserRequirement = { ...data, id: uid() };
  items.push(item);
  set(KEYS.USER_REQUIREMENTS, items);
  return item;
}

export function deleteUserRequirement(id: string): void {
  set(KEYS.USER_REQUIREMENTS, get<UserRequirement>(KEYS.USER_REQUIREMENTS).filter(ur => ur.id !== id));
}

// ============= LOGS =============

export function getLogs(): SystemLog[] {
  return get<SystemLog>(KEYS.LOGS).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addLog(data: Omit<SystemLog, 'id' | 'created_at'>): SystemLog {
  const items = get<SystemLog>(KEYS.LOGS);
  const item: SystemLog = { ...data, id: uid(), created_at: now() };
  items.push(item);
  set(KEYS.LOGS, items);
  return item;
}

// ============= NOTIFICATIONS =============

export function getNotifications(userId?: string): Notification[] {
  const items = get<Notification>(KEYS.NOTIFICATIONS);
  const filtered = userId ? items.filter(n => n.user_id === userId) : items;
  return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createNotification(data: Omit<Notification, 'id' | 'created_at'>): Notification {
  const items = get<Notification>(KEYS.NOTIFICATIONS);
  const item: Notification = { ...data, id: uid(), created_at: now() };
  items.push(item);
  set(KEYS.NOTIFICATIONS, items);
  return item;
}

export function markNotificationRead(id: string): void {
  const items = get<Notification>(KEYS.NOTIFICATIONS);
  const idx = items.findIndex(n => n.id === id);
  if (idx !== -1) {
    items[idx].read = true;
    set(KEYS.NOTIFICATIONS, items);
  }
}

export function markAllNotificationsRead(userId: string): void {
  const items = get<Notification>(KEYS.NOTIFICATIONS);
  items.forEach(n => { if (n.user_id === userId) n.read = true; });
  set(KEYS.NOTIFICATIONS, items);
}

// ============= ORG TREE =============

export function getOrgTree(): OrgNode[] {
  return get<OrgNode>(KEYS.ORG_TREE);
}

export function setOrgTree(tree: OrgNode[]): void {
  set(KEYS.ORG_TREE, tree);
}
