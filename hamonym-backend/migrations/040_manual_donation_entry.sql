-- Manual donation entry — lets an entity manager log an offline donation
-- (bank transfer/check/cash/other) directly, distinct from the Cardcom flow.
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS source VARCHAR(20)
    CHECK (source IN ('bank_transfer', 'check', 'cash', 'other')),
  ADD COLUMN IF NOT EXISTS supporters_count INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS entered_by BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS note TEXT;
