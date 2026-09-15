-- Migration 0005: allow system_logs entries without a known actor.
-- Failed logins with an unknown e-mail address have no user to reference;
-- with actor_id NOT NULL those events were silently dropped.

ALTER TABLE system_logs
  ALTER COLUMN actor_id DROP NOT NULL;
