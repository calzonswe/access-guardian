-- Migration 0009: per-user language and e-mail notification preferences.
-- * users.language: 'sv' (default) or 'en'; drives UI, server messages,
--   stored notifications and e-mails for that user.
-- * users.language_set: true once the user chose a language explicitly.
-- * users.email_prefs: { action, status, expiry } booleans; missing = on.

ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(2) NOT NULL DEFAULT 'sv';
ALTER TABLE users ADD COLUMN IF NOT EXISTS language_set BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_language_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_language_check CHECK (language IN ('sv', 'en'));
  END IF;
END $$;
