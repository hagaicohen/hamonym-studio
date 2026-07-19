-- Migration: Multi-Participant Registration (2.4)
-- See docs/DECISIONS.md (2026-07-15). Adds only what the real use case needs
-- (shirt size) — birth_year/gender etc. from the original spec's data model
-- stay deferred until there's a concrete requirement for them.

ALTER TABLE registration_participants
  ADD COLUMN IF NOT EXISTS shirt_size VARCHAR(20);
