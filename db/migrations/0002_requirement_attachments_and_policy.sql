-- Migration 0002: store user_requirements attachments on disk (not base64),
-- and seed default configurable password policy.

ALTER TABLE user_requirements
  ADD COLUMN IF NOT EXISTS attachment_storage_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS attachment_mime VARCHAR(100),
  ADD COLUMN IF NOT EXISTS attachment_size_bytes INTEGER;

-- Default password policy (M6). Admin can override via Settings.
INSERT INTO system_settings (key, value)
VALUES ('passwordPolicy', '{"minLength":8,"requireUpper":true,"requireLower":true,"requireDigit":true,"requireSymbol":true}')
ON CONFLICT (key) DO NOTHING;
