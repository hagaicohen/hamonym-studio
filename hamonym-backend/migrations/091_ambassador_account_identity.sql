-- Apply separately after review. Preserves every ambassador and all donation IDs.
BEGIN;
LOCK TABLE campaign_ambassadors IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaign_ambassadors' AND column_name='user_id' AND data_type='uuid') THEN
  IF EXISTS(SELECT 1 FROM campaign_ambassadors WHERE user_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Existing UUID account links require explicit review; no conversion performed';
  END IF;
  ALTER TABLE campaign_ambassadors ALTER COLUMN user_id TYPE bigint USING NULL::bigint;
 END IF;
END $$;
ALTER TABLE campaign_ambassadors ADD CONSTRAINT campaign_ambassadors_account_user_fkey FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_ambassadors_account_user ON campaign_ambassadors(user_id) WHERE user_id IS NOT NULL;
COMMIT;
