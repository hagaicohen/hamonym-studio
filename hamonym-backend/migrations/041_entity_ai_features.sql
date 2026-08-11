-- AI Visibility Gate — every AI-labeled capability (campaign creation via
-- AI, campaign advisor, publish-step metadata suggestion, partner AI
-- website import) is hidden/greyed out for clients by default; only a
-- Platform Admin can grant it, one entity at a time.
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS ai_features_enabled BOOLEAN NOT NULL DEFAULT false;
