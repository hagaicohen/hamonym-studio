-- Migration: read-state for platform_audit_log rows, powering the entity-
-- manager-facing notification bell — "the platform admin responded to your
-- entity, and you haven't seen it yet." NULL = unread/unacknowledged.
ALTER TABLE platform_audit_log ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
