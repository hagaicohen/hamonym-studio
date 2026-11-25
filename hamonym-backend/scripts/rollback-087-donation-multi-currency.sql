-- Rollback for migration 087 (multi-currency donations). Deploy code without
-- the currency columns first. Refuses to run while any non-ILS donation,
-- recurring instruction or receipt exists: dropping their currency would turn
-- foreign amounts into shekel amounts.
-- After running, record it in docs/MIGRATION_HISTORY_NOTES.md (087 stays used).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.donations WHERE currency <> 'ILS')
     OR EXISTS (SELECT 1 FROM public.recurring_instructions WHERE currency <> 'ILS')
     OR EXISTS (SELECT 1 FROM public.receipts WHERE currency <> 'ILS') THEN
    RAISE EXCEPTION 'non-ILS records exist; rollback of 087 would corrupt their amounts';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_donations_sync_ils_equivalent ON public.donations;
DROP FUNCTION IF EXISTS public.donations_sync_ils_equivalent();
DROP INDEX IF EXISTS public.donations_fx_pending_idx;
ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_fx_consistency,
  DROP CONSTRAINT IF EXISTS donations_settlement_currency_check,
  DROP CONSTRAINT IF EXISTS donations_fx_status_check,
  DROP CONSTRAINT IF EXISTS donations_currency_check,
  DROP COLUMN IF EXISTS settlement_source,
  DROP COLUMN IF EXISTS settlement_rate,
  DROP COLUMN IF EXISTS settlement_currency,
  DROP COLUMN IF EXISTS settlement_amount,
  DROP COLUMN IF EXISTS provider_coin_id,
  DROP COLUMN IF EXISTS provider_amount,
  DROP COLUMN IF EXISTS fx_status,
  DROP COLUMN IF EXISTS fx_rate_date,
  DROP COLUMN IF EXISTS fx_rate_source,
  DROP COLUMN IF EXISTS fx_rate,
  DROP COLUMN IF EXISTS amount_ils,
  DROP COLUMN IF EXISTS currency;

DROP TRIGGER IF EXISTS trg_recurring_instructions_currency_immutable ON public.recurring_instructions;
DROP FUNCTION IF EXISTS public.recurring_instructions_currency_immutable();
ALTER TABLE public.recurring_instructions
  DROP CONSTRAINT IF EXISTS recurring_instructions_currency_check,
  DROP COLUMN IF EXISTS currency;

ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_currency_check,
  DROP COLUMN IF EXISTS currency;

DROP TABLE IF EXISTS public.exchange_rate_resolutions;
DROP FUNCTION IF EXISTS public.exchange_rate_resolutions_block_change();
COMMIT;
