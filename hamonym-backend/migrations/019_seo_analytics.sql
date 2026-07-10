-- Per-entity Google Analytics 4 measurement ID (optional, in addition to the
-- platform's own GA4 account which is configured via env, not per-entity).
ALTER TABLE entities ADD COLUMN IF NOT EXISTS ga_measurement_id TEXT;
