-- ─────────────────────────────────────────────────────────
-- 004_ambassadors.sql
-- Ambassador attribution layer on top of campaigns
-- ─────────────────────────────────────────────────────────

CREATE TABLE campaign_ambassadors (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  full_name        TEXT        NOT NULL,
  phone            TEXT,
  email            TEXT,
  goal_amount      NUMERIC(12,2),
  status           TEXT        NOT NULL DEFAULT 'active'  -- active | inactive | pending
                   CHECK (status IN ('active','inactive','pending')),
  personal_message TEXT        NOT NULL DEFAULT '',
  slug             TEXT        NOT NULL,                   -- URL-friendly identifier e.g. gad-ivgi
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL  -- optional future link

  CONSTRAINT campaign_ambassadors_unique_slug UNIQUE (campaign_id, slug)
);

-- Manual fundraising adjustments (cash, cheques, transfers)
CREATE TABLE ambassador_adjustments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id  UUID        NOT NULL REFERENCES campaign_ambassadors(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason         TEXT        NOT NULL DEFAULT '',
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which ambassador referred each donation
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS ambassador_id UUID REFERENCES campaign_ambassadors(id) ON DELETE SET NULL;

-- Indexes for common queries
CREATE INDEX idx_camp_amb_campaign  ON campaign_ambassadors(campaign_id);
CREATE INDEX idx_camp_amb_slug      ON campaign_ambassadors(campaign_id, slug);
CREATE INDEX idx_amb_adj_ambassador ON ambassador_adjustments(ambassador_id);
CREATE INDEX idx_donations_ambassador ON donations(ambassador_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_ambassadors_updated_at
  BEFORE UPDATE ON campaign_ambassadors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
