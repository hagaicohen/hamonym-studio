ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_for_review_reason TEXT,
  ADD COLUMN IF NOT EXISTS flagged_for_review_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_entities_flagged_for_review
  ON entities (flagged_for_review)
  WHERE flagged_for_review = true;
