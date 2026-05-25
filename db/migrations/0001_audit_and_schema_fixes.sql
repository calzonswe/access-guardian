-- Migration 0001: Audit log enum to varchar, mime_type on attachments,
-- password reset tokens, drop unused attachment_data column,
-- composite index on system_logs.

-- 1. Convert system_logs.action from enum to varchar so new event names work.
ALTER TABLE system_logs
  ALTER COLUMN action TYPE VARCHAR(64) USING action::text;

-- The enum type is no longer referenced — drop it (safe if no other ref).
DROP TYPE IF EXISTS log_action;

CREATE INDEX IF NOT EXISTS idx_system_logs_created_action
  ON system_logs (created_at DESC, action);

-- 2. Attachment mime type
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);

-- 3. Password reset tokens (one-shot, hashed)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens (user_id);

-- 4. Drop legacy base64 column on user_requirements (post SEC-3)
ALTER TABLE user_requirements
  DROP COLUMN IF EXISTS attachment_data;

-- 5. Login attempt persistence (used by configurable lockout in future)
CREATE TABLE IF NOT EXISTS login_attempts (
  email VARCHAR(255) PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ
);
