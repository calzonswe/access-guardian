-- Migration 0007: record revocations separately from natural expiry.
-- A revoked application still gets status 'expired' (so every existing
-- "no longer valid" check keeps working), but now also carries who revoked
-- it, when and why.

ALTER TABLE applications ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS revoke_reason TEXT;
