-- Migration 0004: performance indexes for common queries
-- Safe to re-run: every index uses IF NOT EXISTS.

-- Applications: sorted lists and date range checks
CREATE INDEX IF NOT EXISTS idx_applications_created ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_dates ON applications(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_applications_status_facility ON applications(status, facility_id);

-- Application areas: reverse lookup (which applications touch an area)
CREATE INDEX IF NOT EXISTS idx_application_areas_area ON application_areas(area_id);

-- Notifications: newest first per user
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Requirements: expiry job scans
CREATE INDEX IF NOT EXISTS idx_user_requirements_expires ON user_requirements(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_requirements_requirement ON user_requirements(requirement_id);
CREATE INDEX IF NOT EXISTS idx_area_requirements_requirement ON area_requirements(requirement_id);
CREATE INDEX IF NOT EXISTS idx_facility_requirements_requirement ON facility_requirements(requirement_id);

-- Users: hierarchy walks and login lookups
CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_users_contact_person ON users(contact_person_id);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));

-- Facilities / facility admins
CREATE INDEX IF NOT EXISTS idx_facilities_owner ON facilities(owner_id);
CREATE INDEX IF NOT EXISTS idx_facility_admins_user ON facility_admins(user_id);

-- Attachments
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded ON attachments(uploaded_at DESC);

-- Logs: filtered by action + time
CREATE INDEX IF NOT EXISTS idx_system_logs_action_created ON system_logs(action, created_at DESC);
