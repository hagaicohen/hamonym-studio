ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS campaign_lifecycle TEXT NOT NULL DEFAULT 'one-time'
    CHECK (campaign_lifecycle IN ('one-time', 'ongoing'));
