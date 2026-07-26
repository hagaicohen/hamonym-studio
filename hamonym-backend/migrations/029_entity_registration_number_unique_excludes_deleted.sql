-- The plain UNIQUE(registration_number) constraint (from before soft-delete
-- existed, see 020_entity_deletion.sql) never excluded deleted rows -- once
-- any entity used a registration number, a soft-deleted copy of it kept
-- that number locked forever, blocking the owner from ever recreating it.
-- Found live (2026-07-23): a user deleted a test org and immediately hit
-- "מספר רישום כבר קיים במערכת" trying to recreate it with the same number.
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_registration_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS entities_registration_number_key
  ON entities (registration_number)
  WHERE deleted_at IS NULL;
