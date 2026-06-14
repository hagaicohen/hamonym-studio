-- 010_ambassador_deactivation.sql
-- Add audit columns for ambassador deactivation

ALTER TABLE campaign_ambassadors
  ADD COLUMN IF NOT EXISTS deactivated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by  UUID REFERENCES users(id);

-- Prevent hard-delete of ambassadors that have any linked donations.
-- A deactivation (status = 'inactive') must be used instead.

CREATE OR REPLACE FUNCTION prevent_ambassador_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM donations WHERE ambassador_id = OLD.id LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot delete ambassador with donations — deactivate instead';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_ambassador_delete ON campaign_ambassadors;

CREATE TRIGGER guard_ambassador_delete
  BEFORE DELETE ON campaign_ambassadors
  FOR EACH ROW EXECUTE FUNCTION prevent_ambassador_delete();
