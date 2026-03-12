import type { User, Facility, Area, Requirement, Application, SystemLog, Notification, UserRequirement } from '@/types/rbac';

export const MOCK_USERS: User[] = [
  {
    id: 'u1', email: 'admin@foretag.se', full_name: 'Anna Svensson',
    roles: ['administrator'], department: 'IT', is_active: true, created_at: '2024-01-01',
  },
  {
    id: 'u2', email: 'erik.facility@foretag.se', full_name: 'Erik Lindqvist',
    roles: ['facility_owner', 'employee'], department: 'Drift', is_active: true, created_at: '2024-01-05',
  },
  {
    id: 'u3', email: 'maria.fadmin@foretag.se', full_name: 'Maria Johansson',
    roles: ['facility_admin', 'employee'], department: 'Drift', is_active: true, created_at: '2024-02-01',
  },
  {
    id: 'u4', email: 'lars.chef@foretag.se', full_name: 'Lars Andersson',
    roles: ['line_manager', 'employee'], department: 'Produktion', is_active: true, created_at: '2024-01-10',
  },
  {
    id: 'u5', email: 'karin.anst@foretag.se', full_name: 'Karin Nilsson',
    roles: ['employee'], department: 'Produktion', manager_id: 'u4', is_active: true, created_at: '2024-03-01',
  },
  {
    id: 'u6', email: 'peter.entre@extern.se', full_name: 'Peter Müller',
    roles: ['contractor'], company: 'ExternTeknik AB', contact_person_id: 'u4', is_active: true, created_at: '2024-06-01',
  },
];

export const MOCK_FACILITIES: Facility[] = [
  {
    id: 'f1', name: 'Kraftverket Norr', description: 'Huvudanläggning för kraftproduktion',
    address: 'Industrivägen 12, Luleå', owner_id: 'u2', admin_ids: ['u3'], created_at: '2024-01-01',
  },
  {
    id: 'f2', name: 'Transformatorstation Öst', description: 'Regional transformatorstation',
    address: 'Stationsgatan 5, Umeå', owner_id: 'u2', admin_ids: ['u3'], created_at: '2024-02-01',
  },
];

export const MOCK_AREAS: Area[] = [
  { id: 'a1', facility_id: 'f1', name: 'Kontrollrum', description: 'Centralt kontrollrum', security_level: 'critical', created_at: '2024-01-01' },
  { id: 'a2', facility_id: 'f1', name: 'Turbinhall', description: 'Turbinhall med roterande maskiner', security_level: 'high', created_at: '2024-01-01' },
  { id: 'a3', facility_id: 'f1', name: 'Lager', description: 'Reservdelslager', security_level: 'medium', created_at: '2024-01-01' },
  { id: 'a4', facility_id: 'f2', name: 'Ställverk', description: 'Högspänningsställverk', security_level: 'critical', created_at: '2024-02-01' },
  { id: 'a5', facility_id: 'f2', name: 'Kontorsyta', description: 'Administrativa kontor', security_level: 'low', created_at: '2024-02-01' },
];

export const MOCK_REQUIREMENTS: Requirement[] = [
  { id: 'r1', name: 'Elsäkerhetsutbildning', description: 'Grundläggande elsäkerhet', type: 'training', has_expiry: true, validity_days: 730 },
  { id: 'r2', name: 'Säkerhetsprövning', description: 'Personlig säkerhetsprövning', type: 'clearance', has_expiry: true, validity_days: 1825 },
  { id: 'r3', name: 'Heta arbeten', description: 'Certifikat för heta arbeten', type: 'certification', has_expiry: true, validity_days: 365 },
  { id: 'r4', name: 'Fallskyddsutbildning', description: 'Arbete på hög höjd', type: 'training', has_expiry: true, validity_days: 365 },
  { id: 'r5', name: 'Introduktionsutbildning', description: 'Anläggningsspecifik introduktion', type: 'training', has_expiry: false },
];

export const MOCK_USER_REQUIREMENTS: UserRequirement[] = [
  { id: 'ur1', user_id: 'u5', requirement_id: 'r1', fulfilled_at: '2024-03-15', expires_at: '2026-03-15', certified_by: 'u4', status: 'fulfilled' },
  { id: 'ur2', user_id: 'u5', requirement_id: 'r5', fulfilled_at: '2024-03-20', status: 'fulfilled' },
  { id: 'ur3', user_id: 'u6', requirement_id: 'r3', fulfilled_at: '2024-06-10', expires_at: '2025-06-10', status: 'fulfilled' },
];

export const MOCK_APPLICATIONS: Application[] = [
  {
    id: 'app1', applicant_id: 'u5', facility_id: 'f1', area_ids: ['a2', 'a3'],
    status: 'pending_manager', start_date: '2025-04-01', end_date: '2025-12-31',
    has_exception: false, attachments: [], created_at: '2025-03-10', updated_at: '2025-03-10',
  },
  {
    id: 'app2', applicant_id: 'u6', facility_id: 'f1', area_ids: ['a1'],
    status: 'pending_exception', start_date: '2025-04-15', end_date: '2025-06-15',
    has_exception: true, exception_justification: 'Erfarenhet från liknande anläggningar i 10 år. Certifiering pågår.',
    manager_approved_at: '2025-03-08', manager_approved_by: 'u4',
    attachments: [{ id: 'att1', application_id: 'app2', file_name: 'CV_Peter_Mueller.pdf', file_url: '#', uploaded_at: '2025-03-05' }],
    created_at: '2025-03-05', updated_at: '2025-03-08',
  },
  {
    id: 'app3', applicant_id: 'u5', facility_id: 'f2', area_ids: ['a5'],
    status: 'approved', start_date: '2025-01-01', end_date: '2025-03-31',
    has_exception: false, manager_approved_at: '2024-12-20', manager_approved_by: 'u4',
    facility_approved_at: '2024-12-22', facility_approved_by: 'u2',
    attachments: [], created_at: '2024-12-18', updated_at: '2024-12-22',
  },
];

export const MOCK_LOGS: SystemLog[] = [
  { id: 'l1', action: 'application_created', actor_id: 'u5', target_id: 'app1', target_type: 'application', details: 'Ansökan skapad för Kraftverket Norr', created_at: '2025-03-10T09:00:00' },
  { id: 'l2', action: 'application_approved_manager', actor_id: 'u4', target_id: 'app2', target_type: 'application', details: 'Linjechef godkände ansökan', created_at: '2025-03-08T14:30:00' },
  { id: 'l3', action: 'application_approved_facility', actor_id: 'u2', target_id: 'app3', target_type: 'application', details: 'Tillträde beviljat till Transformatorstation Öst', created_at: '2024-12-22T10:00:00' },
  { id: 'l4', action: 'user_created', actor_id: 'u1', target_id: 'u6', target_type: 'user', details: 'Entreprenör Peter Müller registrerad', created_at: '2024-06-01T08:00:00' },
  { id: 'l5', action: 'requirement_fulfilled', actor_id: 'u4', target_id: 'ur1', target_type: 'user_requirement', details: 'Elsäkerhetsutbildning intygrad för Karin Nilsson', created_at: '2024-03-15T11:00:00' },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n1', user_id: 'u4', title: 'Ny ansökan att granska', message: 'Karin Nilsson har ansökt om tillträde till Kraftverket Norr', type: 'action_required', read: false, link: '/applications/app1', created_at: '2025-03-10T09:00:00' },
  { id: 'n2', user_id: 'u2', title: 'Avsteg att godkänna', message: 'Peter Müller har begärt avsteg för Kontrollrum', type: 'action_required', read: false, link: '/applications/app2', created_at: '2025-03-08T14:30:00' },
  { id: 'n3', user_id: 'u5', title: 'Tillträde upphör snart', message: 'Ditt tillträde till Transformatorstation Öst upphör om 19 dagar', type: 'warning', read: false, link: '/my-access', created_at: '2025-03-12T08:00:00' },
];
