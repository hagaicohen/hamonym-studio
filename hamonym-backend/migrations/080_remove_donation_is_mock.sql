-- Donation payment status is authoritative, independent of terminal TEST/production.
-- Deploy compatible application code FIRST; then apply this transaction.
-- No donation rows/statuses/amounts are updated. No CASCADE; unexpected dependencies fail closed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $migration$
DECLARE before_definition text; after_definition text;
BEGIN
  SELECT pg_get_functiondef('donations_enforce_paid_immutability()'::regprocedure)
    INTO before_definition;
  after_definition := regexp_replace(before_definition,
    E'\n[ \t]*OR NEW\\.is_mock[ \t]+IS DISTINCT FROM OLD\\.is_mock[ \t]*', '', 'g');
  IF position('is_mock' IN after_definition) > 0 THEN
    RAISE EXCEPTION 'Unexpected is_mock reference in paid immutability function; review before migration';
  END IF;
  IF after_definition IS DISTINCT FROM before_definition THEN EXECUTE after_definition; END IF;
END;
$migration$;

ALTER TABLE donations DROP COLUMN IF EXISTS is_mock;
CREATE INDEX IF NOT EXISTS idx_donations_billing_select
  ON donations (entity_id, billing_effective_at)
  WHERE status = 'paid' AND effective_statement_id IS NULL;
COMMIT;
