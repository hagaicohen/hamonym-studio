-- Local preparation only. Shared application requires explicit migration approval.
-- 089: the language a donor read the campaign in when donating (bilingual
-- roadmap D-50). Used only to choose the language of donor-facing messages and
-- of the thank-you page; amounts, currency, statuses, receipts and every
-- financial field are untouched.
-- Additive: one nullable column, no default, no backfill. NULL = Hebrew (every
-- existing donation, and every donation made in Hebrew).
-- Rollback: scripts/rollback-089-donation-donor-language.sql
BEGIN;

ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS donor_language TEXT;

ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_donor_language_check;
ALTER TABLE public.donations
  ADD CONSTRAINT donations_donor_language_check CHECK (donor_language IS NULL OR donor_language IN ('he', 'en'));

COMMENT ON COLUMN public.donations.donor_language IS
  'Language of the campaign version the donor used (he/en). NULL = Hebrew. Display/communication only; never financial.';

COMMIT;
