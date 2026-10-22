-- Apply explicitly; never executed by server startup. Real timestamps stay unchanged.
ALTER TABLE collection_attempts ADD COLUMN business_collection_at TIMESTAMPTZ;
CREATE UNIQUE INDEX collection_attempts_one_simulated_day
  ON collection_attempts (statement_id, ((business_collection_at AT TIME ZONE 'Asia/Jerusalem')::date))
  WHERE business_collection_at IS NOT NULL;
CREATE FUNCTION protect_attempt_business_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.business_collection_at IS DISTINCT FROM OLD.business_collection_at THEN
    RAISE EXCEPTION 'business collection timestamp is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER collection_attempt_business_time_immutable BEFORE UPDATE ON collection_attempts
FOR EACH ROW EXECUTE FUNCTION protect_attempt_business_time();
-- This scoped clock is NOT simulation_clock: other jobs keep their existing time.
CREATE TABLE fin11_simulation_clock (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  business_at TIMESTAMPTZ NOT NULL,
  entity_ids UUID[] NOT NULL CHECK (cardinality(entity_ids) > 0),
  identity_fingerprint TEXT NOT NULL,
  super_admin_user_id BIGINT NOT NULL REFERENCES users(id),
  pending BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
