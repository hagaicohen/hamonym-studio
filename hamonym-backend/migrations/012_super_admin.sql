-- 012_super_admin.sql
-- Platform-level Super Admin support

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id                  SERIAL PRIMARY KEY,
  super_admin_user_id BIGINT NOT NULL REFERENCES users(id),
  entity_id           UUID REFERENCES entities(id),
  action              TEXT NOT NULL, -- 'approve' | 'reject' | 'request_changes' | 'suspend' | 'reactivate'
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
