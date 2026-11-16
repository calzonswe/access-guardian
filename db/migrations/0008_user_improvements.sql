-- Migration 0008: user improvements
-- * applications.status_changed_at / reminded_at / escalated_at: reminders and
--   escalation for applications that wait too long in a pending status.
-- * applications.renewed_from_id: a renewal points at the application it renews.
-- * users.substitute_*: a line manager's stand-in during absence.

ALTER TABLE applications ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
UPDATE applications SET status_changed_at = COALESCE(updated_at, created_at) WHERE status_changed_at IS NULL;
ALTER TABLE applications ALTER COLUMN status_changed_at SET DEFAULT now();
ALTER TABLE applications ALTER COLUMN status_changed_at SET NOT NULL;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS renewed_from_id UUID REFERENCES applications(id) ON DELETE SET NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS substitute_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS substitute_from DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS substitute_to DATE;

CREATE INDEX IF NOT EXISTS idx_applications_pending_since
  ON applications (status, status_changed_at)
  WHERE status IN ('pending_manager', 'pending_facility', 'pending_exception');
