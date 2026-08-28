-- Manual donation idempotency (F4.1) — a deterministic UUID identifying one
-- submission intent, generated client-side once per "log a manual
-- donation" action and reused on retry. Nullable and scoped to entity: two
-- one-time donations (recurring or online) sharing no such key are
-- completely unaffected, and two genuinely distinct manual entries never
-- collide as long as each got its own key at submission time.
--
-- NOT RUN YET — presented for review only.

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS client_submission_key UUID;

-- Partial — only rows that actually carry a key participate. Two manual
-- donations for the same entity with the same key are the same submission
-- intent; NULL keys (every non-manual donation, and any manual donation
-- from before this column existed) are exempt by standard SQL NULL
-- semantics, no extra WHERE needed for that part.
CREATE UNIQUE INDEX IF NOT EXISTS uq_donations_entity_client_submission_key
  ON donations (entity_id, client_submission_key)
  WHERE client_submission_key IS NOT NULL;

-- Extends migration 055's immutability trigger (CREATE OR REPLACE keeps the
-- existing trigger wired to this function — no DROP/CREATE TRIGGER needed)
-- to also freeze client_submission_key once a donation is 'paid'. It's an
-- identifier of the submission event, same category as provider_reference/
-- low_profile_id, not operational metadata.
CREATE OR REPLACE FUNCTION donations_enforce_paid_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    IF NEW.amount              IS DISTINCT FROM OLD.amount
       OR NEW.entity_id        IS DISTINCT FROM OLD.entity_id
       OR NEW.campaign_id      IS DISTINCT FROM OLD.campaign_id
       OR NEW.is_mock          IS DISTINCT FROM OLD.is_mock
       OR NEW.completed_at     IS DISTINCT FROM OLD.completed_at
       OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
       OR NEW.low_profile_id   IS DISTINCT FROM OLD.low_profile_id
       OR NEW.client_submission_key IS DISTINCT FROM OLD.client_submission_key
       OR NEW.status           IS DISTINCT FROM OLD.status
    THEN
      RAISE EXCEPTION 'donation % financial fields are frozen once paid', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
