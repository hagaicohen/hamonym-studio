-- Migration: add Cardcom credentials to entities + create donations table

-- Each entity (nonprofit) has its own Cardcom terminal credentials
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS cardcom_terminal     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS cardcom_api_name     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cardcom_api_password VARCHAR(255);

-- Donation records
CREATE TABLE IF NOT EXISTS donations (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  entity_id        UUID         NOT NULL REFERENCES entities(id)  ON DELETE CASCADE,
  amount           DECIMAL(10,2) NOT NULL,
  donor_name       VARCHAR(255),
  donor_email      VARCHAR(255),
  donor_phone      VARCHAR(50),
  donor_id_number  VARCHAR(20),
  donor_address    TEXT,
  rewards          JSONB        NOT NULL DEFAULT '[]',
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | paid | failed
  low_profile_id   VARCHAR(100),
  low_profile_code VARCHAR(100),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_donations_entity   ON donations(entity_id);
CREATE INDEX IF NOT EXISTS idx_donations_status   ON donations(status);
