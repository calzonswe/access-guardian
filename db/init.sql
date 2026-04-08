-- ============================================
-- RBAC Access Control System - Database Schema
-- ============================================

-- Roles enum
CREATE TYPE app_role AS ENUM (
  'administrator',
  'facility_owner',
  'facility_admin',
  'line_manager',
  'employee',
  'contractor'
);

-- Requirement types
CREATE TYPE requirement_type AS ENUM ('certification', 'clearance', 'training');

-- Application statuses
CREATE TYPE application_status AS ENUM (
  'draft',
  'pending_manager',
  'pending_facility',
  'pending_exception',
  'approved',
  'denied',
  'expired'
);

-- Security levels
CREATE TYPE security_level AS ENUM ('low', 'medium', 'high', 'critical');

-- Fulfillment status
CREATE TYPE fulfillment_status AS ENUM ('fulfilled', 'expired', 'pending');

-- Notification types
CREATE TYPE notification_type AS ENUM ('info', 'warning', 'action_required');

-- Log action types
CREATE TYPE log_action AS ENUM (
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
  'settings_changed'
);

-- ============================================
-- TABLES
-- ============================================

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  first_name VARCHAR(128) DEFAULT '',
  last_name VARCHAR(128) DEFAULT '',
  password_hash VARCHAR(255),
  department VARCHAR(100),
  title VARCHAR(255),
  phone VARCHAR(50),
  manager_id UUID REFERENCES users(id),
  contact_person_id UUID REFERENCES users(id),
  company VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles (separate table for RBAC)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Organization positions (company hierarchy tree)
CREATE TABLE organization_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  department VARCHAR(100),
  parent_id UUID REFERENCES organization_positions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Facilities
CREATE TABLE facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  address TEXT,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Facility admins (many-to-many)
CREATE TABLE facility_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (facility_id, user_id)
);

-- Areas
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  security_level security_level NOT NULL DEFAULT 'low',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Requirements
CREATE TABLE requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type requirement_type NOT NULL,
  has_expiry BOOLEAN NOT NULL DEFAULT false,
  validity_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Area requirements (which requirements are needed for an area)
CREATE TABLE area_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  UNIQUE (area_id, requirement_id)
);

-- Facility requirements (which requirements are needed for a facility)
CREATE TABLE facility_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  UNIQUE (facility_id, requirement_id)
);

-- User requirement fulfillments
CREATE TABLE user_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  fulfilled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  certified_by UUID REFERENCES users(id),
  status fulfillment_status NOT NULL DEFAULT 'pending',
  attachment_name VARCHAR(255),
  attachment_data TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Applications
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES users(id),
  facility_id UUID NOT NULL REFERENCES facilities(id),
  status application_status NOT NULL DEFAULT 'draft',
  start_date DATE NOT NULL,
  end_date DATE,
  has_exception BOOLEAN NOT NULL DEFAULT false,
  exception_justification TEXT,
  manager_approved_at TIMESTAMPTZ,
  manager_approved_by UUID REFERENCES users(id),
  facility_approved_at TIMESTAMPTZ,
  facility_approved_by UUID REFERENCES users(id),
  exception_approved_at TIMESTAMPTZ,
  exception_approved_by UUID REFERENCES users(id),
  denied_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Application areas (many-to-many)
CREATE TABLE application_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  UNIQUE (application_id, area_id)
);

-- Attachments
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- System logs
CREATE TABLE system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action log_action NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  target_id UUID,
  target_type VARCHAR(50),
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  link VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- System settings
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);
CREATE INDEX idx_org_positions_parent ON organization_positions(parent_id);
CREATE INDEX idx_org_positions_user ON organization_positions(user_id);
CREATE INDEX idx_areas_facility ON areas(facility_id);
CREATE INDEX idx_area_requirements_area ON area_requirements(area_id);
CREATE INDEX idx_facility_requirements_facility ON facility_requirements(facility_id);
CREATE INDEX idx_user_requirements_user ON user_requirements(user_id);
CREATE INDEX idx_user_requirements_status ON user_requirements(status);
CREATE INDEX idx_applications_applicant ON applications(applicant_id);
CREATE INDEX idx_applications_facility ON applications(facility_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_application_areas_app ON application_areas(application_id);
CREATE INDEX idx_attachments_app ON attachments(application_id);
CREATE INDEX idx_system_logs_action ON system_logs(action);
CREATE INDEX idx_system_logs_actor ON system_logs(actor_id);
CREATE INDEX idx_system_logs_created ON system_logs(created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);

-- ============================================
-- HELPER FUNCTION: Check user role
-- ============================================

CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_facilities_updated_at BEFORE UPDATE ON facilities FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_org_positions_updated_at BEFORE UPDATE ON organization_positions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SEED DATA
-- ============================================

-- Default system settings
INSERT INTO system_settings (key, value) VALUES
  ('branding', '{"appName": "RBAC Access", "subtitle": "Tillträdeshantering"}'),
  ('notifications', '{"expiryWarningDays": [30, 7, 1]}'),
  ('security', '{"sessionTimeoutMinutes": 30, "maxLoginAttempts": 5}');
