-- Quality metrics for the AI Website Import feature — logged once per
-- POST /apply (not per /classify, since tier outcomes are only final once
-- the manager has actually reviewed/edited the review screen). Same
-- immutable-log convention as campaign_ai_generations (migration 031).
CREATE TABLE IF NOT EXISTS partner_import_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES partner_import_sessions(id),
  extract_time_ms INT,
  classification_time_ms INT,
  blocks_found INT NOT NULL DEFAULT 0,
  accepted_automatically INT NOT NULL DEFAULT 0,
  accepted_after_review INT NOT NULL DEFAULT 0,
  discarded INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
