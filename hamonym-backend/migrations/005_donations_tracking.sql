-- ─────────────────────────────────────────────────────────
-- 005_donations_tracking.sql
-- Add tracking fields to donations: utm, ip, user_agent,
-- is_anonymous (fixes existing bug), postal_code
-- ─────────────────────────────────────────────────────────

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS utm_params    JSONB,
  ADD COLUMN IF NOT EXISTS ip_address    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS user_agent    TEXT,
  ADD COLUMN IF NOT EXISTS is_anonymous  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS postal_code   VARCHAR(20);

-- Index for anonymous filter (used in donors list query)
CREATE INDEX IF NOT EXISTS idx_donations_anonymous ON donations(is_anonymous);

-- Index for utm source analytics
CREATE INDEX IF NOT EXISTS idx_donations_utm ON donations USING gin(utm_params);
