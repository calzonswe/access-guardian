import { test as base, Page, APIRequestContext, request } from '@playwright/test';

const API_BASE = process.env.API_URL || 'http://localhost:3000/api';

let _globalApiContext: APIRequestContext | null = null;

export async function getApiContext(token?: string): Promise<APIRequestContext> {
  if (!_globalApiContext) {
    _globalApiContext = await request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: {},
    });
  }
  return _globalApiContext;
}

export async function apiRequest(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; data: unknown }> {
  const ctx = await getApiContext(token);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options: Record<string, unknown> = { headers };
  if (body) options['data'] = body;

  const res = await (ctx as Record<string, Function>)[method](path, options as Parameters<typeof ctx.get>[1]);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status(), data };
}

export async function login(email: string, password: string): Promise<{ token: string; userId: string; roles: string[] }> {
  const { status, data } = await apiRequest('post', '/auth/login', { email, password });
  if (status !== 200) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  const body = data as { token: string; user: { id: string; roles: string[] } };
  return { token: body.token, userId: body.user.id, roles: body.user.roles };
}

export async function getMe(token: string) {
  return apiRequest('get', '/auth/me', undefined, token);
}

export async function changePassword(token: string, newPassword: string) {
  return apiRequest('post', '/auth/change-password', { newPassword }, token);
}

export async function createUser(token: string, data: {
  email: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  password: string;
  department?: string;
  title?: string;
  phone?: string;
  manager_id?: string;
  company?: string;
  is_active?: boolean;
  roles?: string[];
}) {
  return apiRequest('post', '/users', data, token);
}

export async function getUsers(token: string) {
  return apiRequest('get', '/users', undefined, token);
}

export async function updateUser(token: string, userId: string, data: Record<string, unknown>) {
  return apiRequest('put', `/users/${userId}`, data, token);
}

export async function deleteUser(token: string, userId: string) {
  return apiRequest('delete', `/users/${userId}`, undefined, token);
}

export async function getFacilities(token: string) {
  return apiRequest('get', '/facilities', undefined, token);
}

export async function createFacility(token: string, data: { name: string; description?: string; address?: string }) {
  return apiRequest('post', '/facilities', data, token);
}

export async function updateFacility(token: string, facilityId: string, data: Record<string, unknown>) {
  return apiRequest('put', `/facilities/${facilityId}`, data, token);
}

export async function deleteFacility(token: string, facilityId: string) {
  return apiRequest('delete', `/facilities/${facilityId}`, undefined, token);
}

export async function addFacilityAdmin(token: string, facilityId: string, userId: string) {
  return apiRequest('post', `/facilities/${facilityId}/admins`, { user_id: userId }, token);
}

export async function removeFacilityAdmin(token: string, facilityId: string, userId: string) {
  return apiRequest('delete', `/facilities/${facilityId}/admins/${userId}`, undefined, token);
}

export async function getAreas(token: string, facilityId?: string) {
  const qs = facilityId ? `?facility_id=${facilityId}` : '';
  return apiRequest('get', `/areas${qs}`, undefined, token);
}

export async function createArea(token: string, data: { facility_id: string; name: string; description?: string; security_level?: string }) {
  return apiRequest('post', '/areas', data, token);
}

export async function updateArea(token: string, areaId: string, data: Record<string, unknown>) {
  return apiRequest('put', `/areas/${areaId}`, data, token);
}

export async function deleteArea(token: string, areaId: string) {
  return apiRequest('delete', `/areas/${areaId}`, undefined, token);
}

export async function getRequirements(token: string) {
  return apiRequest('get', '/requirements', undefined, token);
}

export async function createRequirement(token: string, data: { name: string; description?: string; type: string; has_expiry?: boolean; validity_days?: number }) {
  return apiRequest('post', '/requirements', data, token);
}

export async function deleteRequirement(token: string, reqId: string) {
  return apiRequest('delete', `/requirements/${reqId}`, undefined, token);
}

export async function getApplications(token: string) {
  return apiRequest('get', '/applications', undefined, token);
}

export async function createApplication(token: string, data: {
  applicant_id: string;
  facility_id: string;
  start_date: string;
  end_date?: string;
  has_exception?: boolean;
  exception_justification?: string;
  area_ids?: string[];
}) {
  return apiRequest('post', '/applications', data, token);
}

export async function updateApplication(token: string, appId: string, data: Record<string, unknown>) {
  return apiRequest('put', `/applications/${appId}`, data, token);
}

export async function deleteApplication(token: string, appId: string) {
  return apiRequest('delete', `/applications/${appId}`, undefined, token);
}

export async function getUserRequirements(token: string, userId?: string) {
  const qs = userId ? `?user_id=${userId}` : '';
  return apiRequest('get', `/user-requirements${qs}`, undefined, token);
}

export async function createUserRequirement(token: string, data: {
  user_id: string;
  requirement_id: string;
  fulfilled_at?: string;
  expires_at?: string;
  certified_by?: string;
  status?: string;
}) {
  return apiRequest('post', '/user-requirements', data, token);
}

export async function updateUserRequirement(token: string, urId: string, data: Record<string, unknown>) {
  return apiRequest('put', `/user-requirements/${urId}`, data, token);
}

export async function deleteUserRequirement(token: string, urId: string) {
  return apiRequest('delete', `/user-requirements/${urId}`, undefined, token);
}

export async function getFacilityRequirements(token: string, facilityId?: string) {
  const qs = facilityId ? `?facility_id=${facilityId}` : '';
  return apiRequest('get', `/facility-requirements${qs}`, undefined, token);
}

export async function addFacilityRequirement(token: string, facilityId: string, reqId: string) {
  return apiRequest('post', '/facility-requirements', { facility_id: facilityId, requirement_id: reqId }, token);
}

export async function removeFacilityRequirement(token: string, facilityId: string, reqId: string) {
  return apiRequest('delete', `/facility-requirements?facility_id=${facilityId}&requirement_id=${reqId}`, undefined, token);
}

export async function getAreaRequirements(token: string, areaId?: string) {
  const qs = areaId ? `?area_id=${areaId}` : '';
  return apiRequest('get', `/area-requirements${qs}`, undefined, token);
}

export async function addAreaRequirement(token: string, areaId: string, reqId: string) {
  return apiRequest('post', '/area-requirements', { area_id: areaId, requirement_id: reqId }, token);
}

export async function removeAreaRequirement(token: string, areaId: string, reqId: string) {
  return apiRequest('delete', `/area-requirements?area_id=${areaId}&requirement_id=${reqId}`, undefined, token);
}

export async function getLogs(token: string, params?: { action?: string; actor_name?: string; details?: string }) {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  ).toString() : '';
  return apiRequest('get', `/logs${qs}`, undefined, token);
}

export async function getNotifications(token: string, userId?: string) {
  const qs = userId ? `?user_id=${userId}` : '';
  return apiRequest('get', `/notifications${qs}`, undefined, token);
}

export async function createNotification(token: string, data: {
  user_id: string;
  title: string;
  message: string;
  type?: string;
  link?: string;
}) {
  return apiRequest('post', '/notifications', data, token);
}

export async function markNotificationRead(token: string, notifId: string) {
  return apiRequest('put', `/notifications/${notifId}/read`, {}, token);
}

export async function markAllNotificationsRead(token: string, userId: string) {
  return apiRequest('put', `/notifications/read-all?user_id=${userId}`, {}, token);
}

export async function getOrgTree(token: string) {
  return apiRequest('get', '/org', undefined, token);
}

export async function setOrgTree(token: string, tree: unknown[]) {
  return apiRequest('put', '/org', tree, token);
}

export async function getSettings(token: string) {
  return apiRequest('get', '/settings', undefined, token);
}

export async function saveSettings(token: string, settings: Record<string, unknown>) {
  return apiRequest('put', '/settings', settings, token);
}

export async function uploadAttachment(token: string, applicationId: string, fileName: string, fileData: string) {
  return apiRequest('post', '/attachments', { application_id: applicationId, file_name: fileName, file_data: fileData }, token);
}

export async function deleteAttachment(token: string, attachmentId: string) {
  return apiRequest('delete', `/attachments/${attachmentId}`, undefined, token);
}

export async function getHealth() {
  return apiRequest('get', '/health', undefined, undefined);
}
