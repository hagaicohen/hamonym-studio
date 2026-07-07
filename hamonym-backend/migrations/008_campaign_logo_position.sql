ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS campaign_logo_url  TEXT,
  ADD COLUMN IF NOT EXISTS hero_logo_position TEXT NOT NULL DEFAULT 'left';
