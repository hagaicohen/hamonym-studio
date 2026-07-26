-- Immutable log of every AI Brief generation (2026-07-23) -- written once
-- per generation, never updated except to attach campaign_id after the
-- fact (a linking action, not a content mutation: brief_json/model/
-- prompt_version are never changed once written). Exists so future
-- analysis ("why do some campaigns do better?") has real history to look
-- at instead of nothing -- can't reconstruct a Brief retroactively once
-- it's gone.
CREATE TABLE IF NOT EXISTS campaign_ai_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  created_by_user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,

  brief_json JSONB NOT NULL,

  web_search_used BOOLEAN NOT NULL DEFAULT false,
  web_sources JSONB NOT NULL DEFAULT '[]',

  generation_time_ms INTEGER,
  generation_reason TEXT NOT NULL CHECK (generation_reason IN ('initial', 'regenerated', 'refined'))
);

CREATE INDEX IF NOT EXISTS idx_campaign_ai_generations_campaign_id ON campaign_ai_generations (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_ai_generations_created_by ON campaign_ai_generations (created_by_user_id);
