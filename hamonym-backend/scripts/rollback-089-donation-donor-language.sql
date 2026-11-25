-- Rollback for migration 089. Donor-facing messages fall back to Hebrew.
BEGIN;
ALTER TABLE public.donations DROP CONSTRAINT IF EXISTS donations_donor_language_check;
ALTER TABLE public.donations DROP COLUMN IF EXISTS donor_language;
COMMIT;
