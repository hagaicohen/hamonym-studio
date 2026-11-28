BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Keep one live membership per account and campaign. Archived memberships
-- retain their original ownership and historical links.
CREATE UNIQUE INDEX campaign_ambassadors_unique_account_live
  ON public.campaign_ambassadors (campaign_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

DROP INDEX public.campaign_ambassadors_unique_account;

ALTER INDEX public.campaign_ambassadors_unique_account_live
  RENAME TO campaign_ambassadors_unique_account;

COMMIT;
