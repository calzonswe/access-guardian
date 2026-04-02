/**
 * Data store that works in two modes:
 * - API mode (production): fetches from backend API
 * - Local mode (dev/preview): uses localStorage as before
 *
 * The mode is determined by VITE_API_URL or availability of /api/health.
 */

import type { User, Facility, Area, Requirement, Application, SystemLog, Notification, UserRequirement, FacilityRequirement } from '@/types/rbac';
import type { OrgNode } from '@/types/organization';
import * as api from '@/services/api';

export interface StoredUser extends User {
  password: string;
  must_change_password: boolean;
}

// ============= In-memory cache =============

let _users: User[] = [];
let _facilities: Facility[] = [];
let _areas: Area[] = [];
let _requirements: Requirement[] = [];
let _applications: Application[] = [];
let _userRequirements: UserRequirement[] = [];
let _logs: SystemLog[] = [];
let _notifications: Notification[] = [];
let _orgTree: OrgNode[] = [];
let _facilityRequirements: FacilityRequirement[] = [];
let _areaRequirements: { id: string; area_id: string; requirement_id: string }[] = [];

let _apiMode = false;
let _initialized = false;

// ============= Initialization =============

async function detectMode(): Promise<boolean> {
  // Check if API is available
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function loadFromApi(): Promise<void> {
  const token = api.getToken();
  if (!token) return; // No token = can't load yet, will load after login

  try {
    const [users, facilities, areas, requirements, applications, logs, notifications, orgTree, userRequirements, facilityRequirements, areaRequirements] = await Promise.all([
      api.getUsers(),
      api.getFacilities(),
      api.getAreas(),
      api.getRequirements(),
      api.getApplications(),
      api.getLogs(),
      api.getNotifications(),
      api.getOrgTree(),
      api.getUserRequirements(),
      api.getFacilityRequirements(),
      api.getAreaRequirements(),
    ]);
    _users = users;
    _facilities = facilities;
    _areas = areas;
    _requirements = requirements;
    _applications = applications;
    _logs = logs;
    _notifications = notifications;
    _orgTree = orgTree;
    _userRequirements = userRequirements;
    _facilityRequirements = facilityRequirements;
    _areaRequirements = areaRequirements;
  } catch (err) {
    console.error('Failed to load data from API:', err);
  }
}

// localStorage fallback helpers
function localGet<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function localSet<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
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

async function initLocalMode(): Promise<void> {
  // Import crypto only in local mode
  const { hashPassword } = await import('@/services/crypto');
  const users = localGet<StoredUser>(KEYS.USERS);
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

  localSet(KEYS.USERS, [adminUser]);
  localSet(KEYS.FACILITIES, []);
  localSet(KEYS.AREAS, []);
  localSet(KEYS.REQUIREMENTS, []);
  localSet(KEYS.APPLICATIONS, []);
  localSet(KEYS.USER_REQUIREMENTS, []);
  localSet(KEYS.LOGS, []);
  localSet(KEYS.NOTIFICATIONS, []);
  localSet(KEYS.ORG_TREE, []);
}

async function initIfNeeded(): Promise<void> {
  if (_initialized) return;
  _apiMode = await detectMode();
  console.log(`[DataStore] Mode: ${_apiMode ? 'API' : 'localStorage'}`);

  if (_apiMode) {
    await loadFromApi();
  } else {
    await initLocalMode();
  }
  _initialized = true;
}

export const initPromise = initIfNeeded();

export function isApiMode(): boolean {
  return _apiMode;
}

/** Reload all data from API (call after login or mutations) */
export async function refreshAll(): Promise<void> {
  if (_apiMode) await loadFromApi();
}

// ============= AUTH (local mode only) =============

export async function authenticate(email: string, password: string): Promise<StoredUser | null> {
  if (_apiMode) {
    // Handled by AuthContext via api.login
    return null;
  }
  const { verifyPassword } = await import('@/services/crypto');
  const users = localGet<StoredUser>(KEYS.USERS);
  for (const u of users) {
    if (u.email.toLowerCase() === email.toLowerCase() && u.is_active) {
      const match = await verifyPassword(password, u.password);
      if (match) return u;
    }
  }
  return null;
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  if (_apiMode) {
    await api.changePassword(newPassword);
    return;
  }
  const { hashPassword } = await import('@/services/crypto');
  const users = localGet<StoredUser>(KEYS.USERS);
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return;
  users[idx].password = await hashPassword(newPassword);
  users[idx].must_change_password = false;
  localSet(KEYS.USERS, users);
}

export function getSession(): StoredUser | null {
  if (_apiMode) return null; // Handled by AuthContext
  try {
    const data = localStorage.getItem(KEYS.SESSION);
    if (!data) return null;
    const session = JSON.parse(data);
    const users = localGet<StoredUser>(KEYS.USERS);
    return users.find(u => u.id === session.id && u.is_active) || null;
  } catch {
    return null;
  }
}

export function setSession(user: StoredUser): void {
  if (_apiMode) return;
  localStorage.setItem(KEYS.SESSION, JSON.stringify({ id: user.id }));
}

export function clearSession(): void {
  if (_apiMode) {
    api.logout();
    return;
  }
  localStorage.removeItem(KEYS.SESSION);
}

// ============= USERS =============

export function getUsers(): User[] {
  if (_apiMode) return _users;
  return localGet<StoredUser>(KEYS.USERS).map(({ password, must_change_password, ...u }) => u);
}

export function getStoredUsers(): StoredUser[] {
  return localGet<StoredUser>(KEYS.USERS);
}

export function getUser(id: string): User | undefined {
  return getUsers().find(u => u.id === id);
}

export function getStoredUser(id: string): StoredUser | undefined {
  return localGet<StoredUser>(KEYS.USERS).find(u => u.id === id);
}

export async function createUser(data: Omit<User, 'id' | 'created_at'> & { password: string }): Promise<User> {
  if (_apiMode) {
    const user = await api.createUser(data);
    _users = await api.getUsers();
    return user;
  }
  const { hashPassword } = await import('@/services/crypto');
  const users = localGet<StoredUser>(KEYS.USERS);
  const hashedPw = await hashPassword(data.password);
  const newUser: StoredUser = {
    ...data,
    password: hashedPw,
    id: uid(),
    created_at: now(),
    must_change_password: true,
  };
  users.push(newUser);
  localSet(KEYS.USERS, users);
  return toPublicUser(newUser);
}

export async function updateUser(id: string, data: Partial<Omit<StoredUser, 'id' | 'created_at'>>): Promise<User | undefined> {
  if (_apiMode) {
    const user = await api.updateUser(id, data as Partial<User>);
    _users = await api.getUsers();
    return user;
  }
  const users = localGet<StoredUser>(KEYS.USERS);
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return undefined;
  const update = { ...data };
  if (update.password) {
    const { hashPassword } = await import('@/services/crypto');
    update.password = await hashPassword(update.password);
  }
  users[idx] = { ...users[idx], ...update };
  localSet(KEYS.USERS, users);
  return toPublicUser(users[idx]);
}

export function deleteUser(id: string): void {
  if (_apiMode) {
    api.deleteUser(id).then(() => { api.getUsers().then(u => { _users = u; }); });
    _users = _users.filter(u => u.id !== id);
    return;
  }
  const users = localGet<StoredUser>(KEYS.USERS);
  localSet(KEYS.USERS, users.filter(u => u.id !== id));
}

function toPublicUser(u: StoredUser): User {
  const { password, must_change_password, ...pub } = u;
  return pub;
}

// ============= FACILITIES =============

export function getFacilities(): Facility[] {
  if (_apiMode) return _facilities;
  return localGet<Facility>(KEYS.FACILITIES);
}

export function getFacility(id: string): Facility | undefined {
  return getFacilities().find(f => f.id === id);
}

export function createFacility(data: Omit<Facility, 'id' | 'created_at'>): Facility {
  if (_apiMode) {
    const temp: Facility = { ...data, id: uid(), created_at: now() };
    api.createFacility(data).then(() => { api.getFacilities().then(f => { _facilities = f; }); });
    _facilities = [..._facilities, temp];
    return temp;
  }
  const items = localGet<Facility>(KEYS.FACILITIES);
  const item: Facility = { ...data, id: uid(), created_at: now() };
  items.push(item);
  localSet(KEYS.FACILITIES, items);
  return item;
}

export function updateFacility(id: string, data: Partial<Omit<Facility, 'id' | 'created_at'>>): Facility | undefined {
  if (_apiMode) {
    const existing = _facilities.find(f => f.id === id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    api.updateFacility(id, data).then(() => { api.getFacilities().then(f => { _facilities = f; }); });
    _facilities = _facilities.map(f => f.id === id ? updated : f);
    return updated;
  }
  const items = localGet<Facility>(KEYS.FACILITIES);
  const idx = items.findIndex(f => f.id === id);
  if (idx === -1) return undefined;
  items[idx] = { ...items[idx], ...data };
  localSet(KEYS.FACILITIES, items);
  return items[idx];
}

export function deleteFacility(id: string): void {
  if (_apiMode) {
    api.deleteFacility(id).then(() => { api.getFacilities().then(f => { _facilities = f; }); });
    _facilities = _facilities.filter(f => f.id !== id);
    return;
  }
  localSet(KEYS.FACILITIES, localGet<Facility>(KEYS.FACILITIES).filter(f => f.id !== id));
  localSet(KEYS.AREAS, localGet<Area>(KEYS.AREAS).filter(a => a.facility_id !== id));
}

// ============= AREAS =============

export function getAreas(facilityId?: string): Area[] {
  if (_apiMode) {
    return facilityId ? _areas.filter(a => a.facility_id === facilityId) : _areas;
  }
  const areas = localGet<Area>(KEYS.AREAS);
  return facilityId ? areas.filter(a => a.facility_id === facilityId) : areas;
}

export function getArea(id: string): Area | undefined {
  return (_apiMode ? _areas : localGet<Area>(KEYS.AREAS)).find(a => a.id === id);
}

export function createArea(data: Omit<Area, 'id' | 'created_at'>): Area {
  if (_apiMode) {
    const temp: Area = { ...data, id: uid(), created_at: now() };
    api.createArea(data).then(() => { api.getAreas().then(a => { _areas = a; }); });
    _areas = [..._areas, temp];
    return temp;
  }
  const items = localGet<Area>(KEYS.AREAS);
  const item: Area = { ...data, id: uid(), created_at: now() };
  items.push(item);
  localSet(KEYS.AREAS, items);
  return item;
}

export function updateArea(id: string, data: Partial<Omit<Area, 'id' | 'created_at'>>): Area | undefined {
  if (_apiMode) {
    const existing = _areas.find(a => a.id === id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    api.updateArea(id, data).then(() => { api.getAreas().then(a => { _areas = a; }); });
    _areas = _areas.map(a => a.id === id ? updated : a);
    return updated;
  }
  const items = localGet<Area>(KEYS.AREAS);
  const idx = items.findIndex(a => a.id === id);
  if (idx === -1) return undefined;
  items[idx] = { ...items[idx], ...data };
  localSet(KEYS.AREAS, items);
  return items[idx];
}

export function deleteArea(id: string): void {
  if (_apiMode) {
    api.deleteArea(id).then(() => { api.getAreas().then(a => { _areas = a; }); });
    _areas = _areas.filter(a => a.id !== id);
    return;
  }
  localSet(KEYS.AREAS, localGet<Area>(KEYS.AREAS).filter(a => a.id !== id));
}

// ============= REQUIREMENTS =============

export function getRequirements(): Requirement[] {
  if (_apiMode) return _requirements;
  return localGet<Requirement>(KEYS.REQUIREMENTS);
}

export function getRequirement(id: string): Requirement | undefined {
  return getRequirements().find(r => r.id === id);
}

export function createRequirement(data: Omit<Requirement, 'id'>): Requirement {
  if (_apiMode) {
    const temp: Requirement = { ...data, id: uid() };
    api.createRequirement(data).then(() => { api.getRequirements().then(r => { _requirements = r; }); });
    _requirements = [..._requirements, temp];
    return temp;
  }
  const items = localGet<Requirement>(KEYS.REQUIREMENTS);
  const item: Requirement = { ...data, id: uid() };
  items.push(item);
  localSet(KEYS.REQUIREMENTS, items);
  return item;
}

export function updateRequirement(id: string, data: Partial<Omit<Requirement, 'id'>>): Requirement | undefined {
  if (_apiMode) {
    const existing = _requirements.find(r => r.id === id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    api.updateRequirement(id, data).then(() => { api.getRequirements().then(r => { _requirements = r; }); });
    _requirements = _requirements.map(r => r.id === id ? updated : r);
    return updated;
  }
  const items = localGet<Requirement>(KEYS.REQUIREMENTS);
  const idx = items.findIndex(r => r.id === id);
  if (idx === -1) return undefined;
  items[idx] = { ...items[idx], ...data };
  localSet(KEYS.REQUIREMENTS, items);
  return items[idx];
}

export function deleteRequirement(id: string): void {
  if (_apiMode) {
    api.deleteRequirement(id).then(() => { api.getRequirements().then(r => { _requirements = r; }); });
    _requirements = _requirements.filter(r => r.id !== id);
    return;
  }
  localSet(KEYS.REQUIREMENTS, localGet<Requirement>(KEYS.REQUIREMENTS).filter(r => r.id !== id));
}

// ============= AREA REQUIREMENTS =============

export function getAreaRequirements(areaId?: string): { id: string; area_id: string; requirement_id: string }[] {
  if (_apiMode) {
    return areaId ? _areaRequirements.filter(ar => ar.area_id === areaId) : _areaRequirements;
  }
  const items = localGet<{ id: string; area_id: string; requirement_id: string }>('rbac_area_requirements');
  return areaId ? items.filter(ar => ar.area_id === areaId) : items;
}

export function addAreaRequirement(areaId: string, requirementId: string): { id: string; area_id: string; requirement_id: string } {
  if (_apiMode) {
    const temp = { id: uid(), area_id: areaId, requirement_id: requirementId };
    api.addAreaRequirement(areaId, requirementId).then(() => { api.getAreaRequirements().then(ar => { _areaRequirements = ar; }); });
    _areaRequirements = [..._areaRequirements, temp];
    return temp;
  }
  const items = localGet<{ id: string; area_id: string; requirement_id: string }>('rbac_area_requirements');
  const existing = items.find(ar => ar.area_id === areaId && ar.requirement_id === requirementId);
  if (existing) return existing;
  const item = { id: uid(), area_id: areaId, requirement_id: requirementId };
  items.push(item);
  localSet('rbac_area_requirements', items);
  return item;
}

export function removeAreaRequirement(areaId: string, requirementId: string): void {
  if (_apiMode) {
    api.removeAreaRequirement(areaId, requirementId).then(() => { api.getAreaRequirements().then(ar => { _areaRequirements = ar; }); });
    _areaRequirements = _areaRequirements.filter(ar => !(ar.area_id === areaId && ar.requirement_id === requirementId));
    return;
  }
  const items = localGet<{ id: string; area_id: string; requirement_id: string }>('rbac_area_requirements');
  localSet('rbac_area_requirements', items.filter(ar => !(ar.area_id === areaId && ar.requirement_id === requirementId)));
}

// ============= FACILITY REQUIREMENTS =============

export function getFacilityRequirements(facilityId?: string): FacilityRequirement[] {
  if (_apiMode) {
    return facilityId ? _facilityRequirements.filter(fr => fr.facility_id === facilityId) : _facilityRequirements;
  }
  const items = localGet<FacilityRequirement>('rbac_facility_requirements');
  return facilityId ? items.filter(fr => fr.facility_id === facilityId) : items;
}

export function addFacilityRequirement(facilityId: string, requirementId: string): FacilityRequirement {
  if (_apiMode) {
    const temp: FacilityRequirement = { id: uid(), facility_id: facilityId, requirement_id: requirementId };
    api.addFacilityRequirement(facilityId, requirementId).then(() => { api.getFacilityRequirements().then(fr => { _facilityRequirements = fr; }); });
    _facilityRequirements = [..._facilityRequirements, temp];
    return temp;
  }
  const items = localGet<FacilityRequirement>('rbac_facility_requirements');
  const existing = items.find(fr => fr.facility_id === facilityId && fr.requirement_id === requirementId);
  if (existing) return existing;
  const item: FacilityRequirement = { id: uid(), facility_id: facilityId, requirement_id: requirementId };
  items.push(item);
  localSet('rbac_facility_requirements', items);
  return item;
}

export function removeFacilityRequirement(facilityId: string, requirementId: string): void {
  if (_apiMode) {
    api.removeFacilityRequirement(facilityId, requirementId).then(() => { api.getFacilityRequirements().then(fr => { _facilityRequirements = fr; }); });
    _facilityRequirements = _facilityRequirements.filter(fr => !(fr.facility_id === facilityId && fr.requirement_id === requirementId));
    return;
  }
  const items = localGet<FacilityRequirement>('rbac_facility_requirements');
  localSet('rbac_facility_requirements', items.filter(fr => !(fr.facility_id === facilityId && fr.requirement_id === requirementId)));
}

// ============= APPLICATIONS =============

export function getApplications(): Application[] {
  if (_apiMode) return _applications;
  return localGet<Application>(KEYS.APPLICATIONS);
}

export function getApplication(id: string): Application | undefined {
  return getApplications().find(a => a.id === id);
}

export function createApplication(data: Omit<Application, 'id' | 'created_at' | 'updated_at'>): Application {
  if (_apiMode) {
    const temp: Application = { ...data, id: uid(), created_at: now(), updated_at: now() };
    api.createApplication(data).then(() => { api.getApplications().then(a => { _applications = a; }); });
    _applications = [..._applications, temp];
    return temp;
  }
  const items = localGet<Application>(KEYS.APPLICATIONS);
  const item: Application = { ...data, id: uid(), created_at: now(), updated_at: now() };
  items.push(item);
  localSet(KEYS.APPLICATIONS, items);
  return item;
}

export function updateApplication(id: string, data: Partial<Omit<Application, 'id' | 'created_at'>>): Application | undefined {
  if (_apiMode) {
    const existing = _applications.find(a => a.id === id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updated_at: now() };
    api.updateApplication(id, data).then(() => { api.getApplications().then(a => { _applications = a; }); });
    _applications = _applications.map(a => a.id === id ? updated : a);
    return updated;
  }
  const items = localGet<Application>(KEYS.APPLICATIONS);
  const idx = items.findIndex(a => a.id === id);
  if (idx === -1) return undefined;
  items[idx] = { ...items[idx], ...data, updated_at: now() };
  localSet(KEYS.APPLICATIONS, items);
  return items[idx];
}

export function deleteApplication(id: string): void {
  if (_apiMode) {
    api.deleteApplication(id).then(() => { api.getApplications().then(a => { _applications = a; }); });
    _applications = _applications.filter(a => a.id !== id);
    return;
  }
  localSet(KEYS.APPLICATIONS, localGet<Application>(KEYS.APPLICATIONS).filter(a => a.id !== id));
}

// ============= USER REQUIREMENTS =============

export function getUserRequirements(userId?: string): UserRequirement[] {
  if (_apiMode) {
    return userId ? _userRequirements.filter(ur => ur.user_id === userId) : _userRequirements;
  }
  const items = localGet<UserRequirement>(KEYS.USER_REQUIREMENTS);
  return userId ? items.filter(ur => ur.user_id === userId) : items;
}

export function createUserRequirement(data: Omit<UserRequirement, 'id'>): UserRequirement {
  if (_apiMode) {
    const temp: UserRequirement = { ...data, id: uid() };
    api.createUserRequirement(data).then(() => { api.getUserRequirements().then(ur => { _userRequirements = ur; }); });
    _userRequirements = [..._userRequirements, temp];
    return temp;
  }
  const items = localGet<UserRequirement>(KEYS.USER_REQUIREMENTS);
  const item: UserRequirement = { ...data, id: uid() };
  items.push(item);
  localSet(KEYS.USER_REQUIREMENTS, items);
  return item;
}

export function deleteUserRequirement(id: string): void {
  if (_apiMode) {
    api.deleteUserRequirement(id).then(() => { api.getUserRequirements().then(ur => { _userRequirements = ur; }); });
    _userRequirements = _userRequirements.filter(ur => ur.id !== id);
    return;
  }
  localSet(KEYS.USER_REQUIREMENTS, localGet<UserRequirement>(KEYS.USER_REQUIREMENTS).filter(ur => ur.id !== id));
}

// ============= LOGS =============

export function getLogs(): SystemLog[] {
  if (_apiMode) return _logs;
  return localGet<SystemLog>(KEYS.LOGS).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addLog(data: Omit<SystemLog, 'id' | 'created_at'>): SystemLog {
  if (_apiMode) {
    const temp: SystemLog = { ...data, id: uid(), created_at: now() };
    api.addLog(data).then(() => { api.getLogs().then(l => { _logs = l; }); });
    _logs = [temp, ..._logs];
    return temp;
  }
  const items = localGet<SystemLog>(KEYS.LOGS);
  const item: SystemLog = { ...data, id: uid(), created_at: now() };
  items.push(item);
  localSet(KEYS.LOGS, items);
  return item;
}

// ============= NOTIFICATIONS =============

export function getNotifications(userId?: string): Notification[] {
  if (_apiMode) {
    const filtered = userId ? _notifications.filter(n => n.user_id === userId) : _notifications;
    return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const items = localGet<Notification>(KEYS.NOTIFICATIONS);
  const filtered = userId ? items.filter(n => n.user_id === userId) : items;
  return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createNotification(data: Omit<Notification, 'id' | 'created_at'>): Notification {
  if (_apiMode) {
    const temp: Notification = { ...data, id: uid(), created_at: now() };
    api.createNotification(data).then(() => { api.getNotifications().then(n => { _notifications = n; }); });
    _notifications = [temp, ..._notifications];
    return temp;
  }
  const items = localGet<Notification>(KEYS.NOTIFICATIONS);
  const item: Notification = { ...data, id: uid(), created_at: now() };
  items.push(item);
  localSet(KEYS.NOTIFICATIONS, items);
  return item;
}

export function markNotificationRead(id: string): void {
  if (_apiMode) {
    api.markNotificationRead(id);
    _notifications = _notifications.map(n => n.id === id ? { ...n, read: true } : n);
    return;
  }
  const items = localGet<Notification>(KEYS.NOTIFICATIONS);
  const idx = items.findIndex(n => n.id === id);
  if (idx !== -1) {
    items[idx].read = true;
    localSet(KEYS.NOTIFICATIONS, items);
  }
}

export function markAllNotificationsRead(userId: string): void {
  if (_apiMode) {
    api.markAllNotificationsRead(userId);
    _notifications = _notifications.map(n => n.user_id === userId ? { ...n, read: true } : n);
    return;
  }
  const items = localGet<Notification>(KEYS.NOTIFICATIONS);
  items.forEach(n => { if (n.user_id === userId) n.read = true; });
  localSet(KEYS.NOTIFICATIONS, items);
}

// ============= ORG TREE =============

export function getOrgTree(): OrgNode[] {
  if (_apiMode) return _orgTree;
  return localGet<OrgNode>(KEYS.ORG_TREE);
}

export function setOrgTree(tree: OrgNode[]): void {
  if (_apiMode) {
    api.setOrgTree(tree);
    _orgTree = tree;
    return;
  }
  localSet(KEYS.ORG_TREE, tree);
}
