-- Cancel is a Hamonym product decision, not a distinct Cardcom mechanism —
-- it reuses the same Operation=update+IsActive=false verified in Phase 5
-- (Pause). cancelled_at is business-facing history (audit, support,
-- reporting), not something Cardcom reports back.
ALTER TABLE recurring_instructions
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
