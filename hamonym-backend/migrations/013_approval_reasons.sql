-- 013_approval_reasons.sql
-- Structured reason tags alongside the free-text note on platform_audit_log

ALTER TABLE platform_audit_log
  ADD COLUMN IF NOT EXISTS reason_tags text[];
