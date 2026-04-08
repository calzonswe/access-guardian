/**
 * API client for communicating with the backend.
 * Replaces localStorage-based dataStore with REST API calls.
 */

import type {
  User, Facility, Area, Requirement, Application, SystemLog,
  Notification, UserRequirement, FacilityRequirement, AppRole,
} from '@/types/rbac';
import type { OrgNode } from '@/types/organization';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ============= Token management =============

let token: string | null = localStorage.getItem('rbac_token');

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('rbac_token', t);
  else localStorage.removeItem('rbac_token');
}

export function getToken(): string | null {
  return token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

// ============= AUTH =============

export interface LoginResponse {
  token: string;
  user: User;
  mustChangePassword: boolean;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await post<LoginResponse>('/auth/login', { email, password });
  setToken(res.token);
  return res;
}

export async function changePassword(newPassword: string): Promise<LoginResponse> {
  const res = await post<LoginResponse>('/auth/change-password', { newPassword });
  setToken(res.token);
  return res;
}

export async function getMe(): Promise<{ user: User; mustChangePassword: boolean }> {
  return get('/auth/me');
}

export function logout() {
  setToken(null);
}

// ============= USERS =============

export function getUsers(): Promise<User[]> {
  return get('/users');
}

export function getUser(id: string): Promise<User> {
  return get(`/users/${id}`);
}

export function createUser(data: Omit<User, 'id' | 'created_at'> & { password: string }): Promise<User> {
  return post('/users', data);
}

export function updateUser(id: string, data: Partial<User & { password?: string }>): Promise<User> {
  return put(`/users/${id}`, data);
}

export function deleteUser(id: string): Promise<void> {
  return del(`/users/${id}`);
}

// ============= FACILITIES =============

export function getFacilities(): Promise<Facility[]> {
  return get('/facilities');
}

export function getFacility(id: string): Promise<Facility> {
  return get(`/facilities/${id}`);
}

export function createFacility(data: Omit<Facility, 'id' | 'created_at'>): Promise<Facility> {
  return post('/facilities', data);
}

export function updateFacility(id: string, data: Partial<Facility>): Promise<Facility> {
  return put(`/facilities/${id}`, data);
}

export function deleteFacility(id: string): Promise<void> {
  return del(`/facilities/${id}`);
}

export function addFacilityAdmin(facilityId: string, userId: string): Promise<void> {
  return post(`/facilities/${facilityId}/admins`, { user_id: userId });
}

export function removeFacilityAdmin(facilityId: string, userId: string): Promise<void> {
  return del(`/facilities/${facilityId}/admins/${userId}`);
}

// ============= AREAS =============

export function getAreas(facilityId?: string): Promise<Area[]> {
  const qs = facilityId ? `?facility_id=${facilityId}` : '';
  return get(`/areas${qs}`);
}

export function createArea(data: Omit<Area, 'id' | 'created_at'>): Promise<Area> {
  return post('/areas', data);
}

export function updateArea(id: string, data: Partial<Area>): Promise<Area> {
  return put(`/areas/${id}`, data);
}

export function deleteArea(id: string): Promise<void> {
  return del(`/areas/${id}`);
}

// ============= REQUIREMENTS =============

export function getRequirements(): Promise<Requirement[]> {
  return get('/requirements');
}

export function createRequirement(data: Omit<Requirement, 'id'>): Promise<Requirement> {
  return post('/requirements', data);
}

export function updateRequirement(id: string, data: Partial<Requirement>): Promise<Requirement> {
  return put(`/requirements/${id}`, data);
}

export function deleteRequirement(id: string): Promise<void> {
  return del(`/requirements/${id}`);
}

// ============= APPLICATIONS =============

export function getApplications(): Promise<Application[]> {
  return get('/applications');
}

export function getApplication(id: string): Promise<Application> {
  return get(`/applications/${id}`);
}

export function createApplication(data: Omit<Application, 'id' | 'created_at' | 'updated_at'>): Promise<Application> {
  return post('/applications', data);
}

export function updateApplication(id: string, data: Partial<Application>): Promise<Application> {
  return put(`/applications/${id}`, data);
}

export function deleteApplication(id: string): Promise<void> {
  return del(`/applications/${id}`);
}

// ============= USER REQUIREMENTS =============

export function getUserRequirements(userId?: string): Promise<UserRequirement[]> {
  const qs = userId ? `?user_id=${userId}` : '';
  return get(`/user-requirements${qs}`);
}

export function createUserRequirement(data: Omit<UserRequirement, 'id'>): Promise<UserRequirement> {
  return post('/user-requirements', data);
}

export function deleteUserRequirement(id: string): Promise<void> {
  return del(`/user-requirements/${id}`);
}

// ============= FACILITY REQUIREMENTS =============

export function getFacilityRequirements(facilityId?: string): Promise<FacilityRequirement[]> {
  const qs = facilityId ? `?facility_id=${facilityId}` : '';
  return get(`/facility-requirements${qs}`);
}

export function addFacilityRequirement(facilityId: string, requirementId: string): Promise<FacilityRequirement> {
  return post('/facility-requirements', { facility_id: facilityId, requirement_id: requirementId });
}

export function removeFacilityRequirement(facilityId: string, requirementId: string): Promise<void> {
  return del(`/facility-requirements?facility_id=${facilityId}&requirement_id=${requirementId}`);
}

// ============= AREA REQUIREMENTS =============

export function getAreaRequirements(areaId?: string): Promise<{ id: string; area_id: string; requirement_id: string }[]> {
  const qs = areaId ? `?area_id=${areaId}` : '';
  return get(`/area-requirements${qs}`);
}

export function addAreaRequirement(areaId: string, requirementId: string): Promise<{ id: string; area_id: string; requirement_id: string }> {
  return post('/area-requirements', { area_id: areaId, requirement_id: requirementId });
}

export function removeAreaRequirement(areaId: string, requirementId: string): Promise<void> {
  return del(`/area-requirements?area_id=${areaId}&requirement_id=${requirementId}`);
}

// ============= LOGS =============

export function getLogs(): Promise<SystemLog[]> {
  return get('/logs');
}

export function addLog(data: Omit<SystemLog, 'id' | 'created_at'>): Promise<SystemLog> {
  return post('/logs', data);
}

// ============= NOTIFICATIONS =============

export function getNotifications(userId?: string): Promise<Notification[]> {
  const qs = userId ? `?user_id=${userId}` : '';
  return get(`/notifications${qs}`);
}

export function createNotification(data: Omit<Notification, 'id' | 'created_at'>): Promise<Notification> {
  return post('/notifications', data);
}

export function markNotificationRead(id: string): Promise<void> {
  return put(`/notifications/${id}/read`, {});
}

export function markAllNotificationsRead(userId: string): Promise<void> {
  return put(`/notifications/read-all?user_id=${userId}`, {});
}

// ============= ORG TREE =============

export function getOrgTree(): Promise<OrgNode[]> {
  return get('/org');
}

export function setOrgTree(tree: OrgNode[]): Promise<void> {
  return put('/org', tree);
}

// ============= SETTINGS =============

export interface SystemSettings {
  branding?: { appName?: string; subtitle?: string; primaryColor?: string; logoUrl?: string };
  notifications?: { expiryWarningDays?: number[]; emailEnabled?: boolean };
  security?: { sessionTimeoutMinutes?: number; maxLoginAttempts?: number; twoFactorRequired?: boolean };
  general?: { organizationName?: string; language?: string; selfRegistration?: boolean };
  auth?: { localEnabled?: boolean; entraEnabled?: boolean; entraTenantId?: string; entraClientId?: string; samlEnabled?: boolean };
}

export function getSettings(): Promise<SystemSettings> {
  return get('/settings');
}

export function saveSettings(settings: SystemSettings): Promise<SystemSettings> {
  return put('/settings', settings);
}

// ============= ATTACHMENTS =============

export interface Attachment {
  id: string;
  application_id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

export function uploadAttachment(applicationId: string, fileName: string, fileData: string): Promise<Attachment> {
  return post('/attachments', { application_id: applicationId, file_name: fileName, file_data: fileData });
}

export function deleteAttachment(id: string): Promise<void> {
  return del(`/attachments/${id}`);
}
