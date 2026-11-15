-- Migration 0006
-- 1. users.password_changed_at: tokens issued before this moment are rejected,
--    so a password change/reset ends all other sessions.
-- 2. ON DELETE SET NULL for optional references to users, so deleting a user
--    no longer fails just because they appear in the audit log, manage
--    someone, sponsor a contractor or approved an application.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

DO $$
DECLARE
  ref RECORD;
  cname TEXT;
BEGIN
  FOR ref IN
    SELECT * FROM (VALUES
      ('users', 'manager_id'),
      ('users', 'contact_person_id'),
      ('system_logs', 'actor_id'),
      ('user_requirements', 'certified_by'),
      ('applications', 'manager_approved_by'),
      ('applications', 'facility_approved_by'),
      ('applications', 'exception_approved_by')
    ) AS t(tbl, col)
  LOOP
    -- Drop whatever FK currently exists on the column (name may vary).
    FOR cname IN
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
       WHERE con.contype = 'f'
         AND con.conrelid = ref.tbl::regclass
         AND att.attname = ref.col
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', ref.tbl, cname);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE SET NULL',
      ref.tbl, ref.tbl || '_' || ref.col || '_fkey', ref.col
    );
  END LOOP;
END $$;
