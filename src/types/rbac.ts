// ============= RBAC Types =============

export type AppRole = 
  | 'administrator'      // Administratör (System Admin)
  | 'facility_owner'     // Anläggningsägare
  | 'facility_admin'     // Anläggningsadministratör
  | 'line_manager'       // Linjechef
  | 'employee'           // Anställd
  | 'contractor';        // Entreprenör

export const ROLE_LABELS: Record<AppRole, string> = {
  administrator: 'Administratör',
  facility_owner: 'Anläggningsägare',
  facility_admin: 'Anläggningsadministratör',
  line_manager: 'Linjechef',
  employee: 'Anställd',
  contractor: 'Entreprenör',
};

export interface User {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  roles: AppRole[];
  department?: string;        // Organisation/enhet
  title?: string;             // Befattning
  phone?: string;             // Telefonnummer
  manager_id?: string;        // Närmaste chef ID
  contact_person_id?: string; // For contractors
  company?: string;           // Företag
  is_active: boolean;
  created_at: string;
}

export interface Facility {
  id: string;
  name: string;
  description: string;
  address: string;
  owner_id: string;           // Facility Owner user ID
  admin_ids: string[];        // Facility Admin user IDs
  created_at: string;
}

export interface Area {
  id: string;
  facility_id: string;
  name: string;
  description: string;
  security_level: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
}

export interface Requirement {
  id: string;
  name: string;
  description: string;
  type: 'certification' | 'clearance' | 'training';
  has_expiry: boolean;
  validity_days?: number;     // How long it's valid once obtained
}

export interface AreaRequirement {
  id: string;
  area_id: string;
  requirement_id: string;
}

export interface FacilityRequirement {
  id: string;
  facility_id: string;
  requirement_id: string;
}

export interface UserRequirement {
  id: string;
  user_id: string;
  requirement_id: string;
  fulfilled_at: string;
  expires_at?: string;
  certified_by?: string;      // Linjechef who certified
  status: 'fulfilled' | 'expired' | 'pending';
  attachment_name?: string;
  attachment_data?: string;    // base64 data URL
}

export type ApplicationStatus = 
  | 'draft'
  | 'pending_manager'      // Waiting for Line Manager / Contact Person
  | 'pending_facility'     // Waiting for Facility Owner/Admin
  | 'pending_exception'    // Exception requested, waiting for Facility Owner only
  | 'approved'
  | 'denied'
  | 'expired';

export interface Application {
  id: string;
  applicant_id: string;
  facility_id: string;
  area_ids: string[];
  status: ApplicationStatus;
  start_date: string;
  end_date?: string;          // null = indefinite
  has_exception: boolean;
  exception_justification?: string;
  manager_approved_at?: string;
  manager_approved_by?: string;
  facility_approved_at?: string;
  facility_approved_by?: string;
  exception_approved_at?: string;
  exception_approved_by?: string;
  denied_reason?: string;
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  application_id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

export type LogAction = 
  | 'application_created'
  | 'application_approved_manager'
  | 'application_approved_facility'
  | 'application_denied'
  | 'exception_approved'
  | 'exception_denied'
  | 'access_granted'
  | 'access_revoked'
  | 'access_expired'
  | 'user_created'
  | 'user_updated'
  | 'role_assigned'
  | 'role_removed'
  | 'requirement_created'
  | 'requirement_fulfilled'
  | 'requirement_expired'
  | 'facility_created'
  | 'area_created'
  | 'settings_changed';

export interface SystemLog {
  id: string;
  action: LogAction;
  actor_id: string;
  target_id?: string;
  target_type?: string;
  details: string;
  created_at: string;
}

// Notification types
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'action_required';
  read: boolean;
  link?: string;
  created_at: string;
}
